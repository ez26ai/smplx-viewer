import { parseNpz } from './npy';
import type { NdArray } from './npy';
import { SMPLX_NUM_JOINTS, SMPLX_NUM_VERTS } from './skeleton';

const SHAPE_SPACE_DIM = 300; // SMPL-X stores 300 shape + 100 expression dirs in `shapedirs`.

export type SmplxParams = {
  betas: Float32Array; // shape coefficients, length = numBetas
  expression: Float32Array; // face expression, length = numExpr
  pose: Float32Array; // axis-angle, length = 55 * 3 = 165 (joint 0 = global orientation)
};

export type ForwardOptions = {
  /** Apply pose-corrective blend shapes (subtle, ~15M FLOPs/frame). On by default. */
  poseBlendShapes: boolean;
};

/**
 * A loaded SMPL-X model. Holds the template, blend-shape bases, joint regressor,
 * skinning weights and kinematic tree, and computes posed/shaped vertices.
 */
export class SmplxModel {
  readonly numVerts: number;
  readonly numJoints: number;
  readonly numBetas: number;
  readonly numExpr: number;

  readonly faces: Uint32Array;
  readonly parents: Int32Array;

  private vTemplate: Float32Array; // (V*3)
  private shapedirs: Float32Array; // (V*3, numBetas+numExpr) row-major
  private posedirs: Float32Array; // (V*3, 486) row-major
  private jRegressor: Float32Array; // (J, V) row-major
  private weights: Float32Array; // (V, J) row-major
  /** Default (mean) hand pose, length 90 = 2*45, applied as the relaxed hand rest pose. */
  readonly handsMean: Float32Array;

  // Scratch buffers (re-used across frames to avoid allocation churn).
  private vShaped: Float32Array;
  private vPosed: Float32Array;
  private joints: Float32Array; // (J*3) rest-pose joints
  posedJoints: Float32Array; // (J*3) joints after posing (public for skeleton overlay)
  private rotMats: Float32Array; // (J*9)
  private relTransforms: Float32Array; // (J*16) skinning matrices
  private outPositions: Float32Array; // (V*3)
  private shapeDirty = true;
  private lastShapeKey = '';

  private constructor(args: {
    numBetas: number;
    numExpr: number;
    faces: Uint32Array;
    parents: Int32Array;
    vTemplate: Float32Array;
    shapedirs: Float32Array;
    posedirs: Float32Array;
    jRegressor: Float32Array;
    weights: Float32Array;
    handsMean: Float32Array;
  }) {
    this.numVerts = SMPLX_NUM_VERTS;
    this.numJoints = SMPLX_NUM_JOINTS;
    this.numBetas = args.numBetas;
    this.numExpr = args.numExpr;
    this.faces = args.faces;
    this.parents = args.parents;
    this.vTemplate = args.vTemplate;
    this.shapedirs = args.shapedirs;
    this.posedirs = args.posedirs;
    this.jRegressor = args.jRegressor;
    this.weights = args.weights;
    this.handsMean = args.handsMean;

    const V3 = this.numVerts * 3;
    this.vShaped = new Float32Array(V3);
    this.vPosed = new Float32Array(V3);
    this.joints = new Float32Array(this.numJoints * 3);
    this.posedJoints = new Float32Array(this.numJoints * 3);
    this.rotMats = new Float32Array(this.numJoints * 9);
    this.relTransforms = new Float32Array(this.numJoints * 16);
    this.outPositions = new Float32Array(V3);
  }

  static async loadFromNpz(
    buffer: ArrayBuffer,
    opts: { numBetas?: number; numExpr?: number } = {}
  ): Promise<SmplxModel> {
    const arrays = await parseNpz(new Uint8Array(buffer));
    return SmplxModel.fromArrays(arrays, opts);
  }

  static fromArrays(
    arrays: Record<string, NdArray>,
    opts: { numBetas?: number; numExpr?: number } = {}
  ): SmplxModel {
    const need = (name: string) => {
      const a = arrays[name];
      if (!a) throw new Error(`Model file is missing "${name}".`);
      return a;
    };

    const vTemplate = need('v_template');
    if (vTemplate.shape[0] !== SMPLX_NUM_VERTS) {
      throw new Error(
        `Expected an SMPL-X model with ${SMPLX_NUM_VERTS} vertices but got ${vTemplate.shape[0]}. ` +
          `This viewer supports SMPL-X (not SMPL / SMPL-H).`
      );
    }
    const shapedirsRaw = need('shapedirs'); // (V, 3, K)
    const posedirsRaw = need('posedirs'); // (V, 3, 486)
    const jRegRaw = need('J_regressor'); // (J, V)
    const weightsRaw = need('weights'); // (V, J)
    const kintree = need('kintree_table'); // (2, J)
    const facesRaw = need('f'); // (F, 3)

    const V = SMPLX_NUM_VERTS;
    const J = SMPLX_NUM_JOINTS;
    const totalShapeDim = shapedirsRaw.shape[2];

    const hasExpr = totalShapeDim >= SHAPE_SPACE_DIM + 1;
    const numBetas = Math.min(opts.numBetas ?? 16, Math.min(totalShapeDim, SHAPE_SPACE_DIM));
    const numExpr = hasExpr
      ? Math.min(opts.numExpr ?? 10, totalShapeDim - SHAPE_SPACE_DIM)
      : 0;
    const C = numBetas + numExpr;

    // Build a compact shapedirs of layout (V*3, C): first numBetas shape dirs,
    // then numExpr expression dirs (which live at offset 300 in the raw array).
    const sd = shapedirsRaw.data as Float32Array;
    const shapedirs = new Float32Array(V * 3 * C);
    for (let row = 0; row < V * 3; row++) {
      const srcBase = row * totalShapeDim;
      const dstBase = row * C;
      for (let b = 0; b < numBetas; b++) shapedirs[dstBase + b] = sd[srcBase + b];
      for (let e = 0; e < numExpr; e++) {
        shapedirs[dstBase + numBetas + e] = sd[srcBase + SHAPE_SPACE_DIM + e];
      }
    }

    // posedirs raw is (V, 3, 486); flattened C-order it is already (V*3, 486).
    const posedirs = posedirsRaw.data as Float32Array;
    if (posedirs.length !== V * 3 * 486) {
      throw new Error(`Unexpected posedirs size (${posedirs.length}).`);
    }

    const jRegressor = jRegRaw.data as Float32Array; // (J, V)
    const weights = weightsRaw.data as Float32Array; // (V, J)

    const parents = new Int32Array(J);
    const kt = kintree.data;
    for (let j = 0; j < J; j++) {
      const p = kt[j]; // first row of kintree_table = parents
      parents[j] = p >= 0 && p < J ? p : -1;
    }

    const faces = new Uint32Array(facesRaw.data.length);
    for (let i = 0; i < faces.length; i++) faces[i] = facesRaw.data[i] >>> 0;

    // Optional relaxed (mean) hand pose.
    const handsMean = new Float32Array(90);
    const meanL = arrays['hands_meanl'];
    const meanR = arrays['hands_meanr'];
    if (meanL && meanR) {
      handsMean.set((meanL.data as Float32Array).subarray(0, 45), 0);
      handsMean.set((meanR.data as Float32Array).subarray(0, 45), 45);
    }

    return new SmplxModel({
      numBetas,
      numExpr,
      faces,
      parents,
      vTemplate: vTemplate.data as Float32Array,
      shapedirs,
      posedirs,
      jRegressor,
      weights,
      handsMean,
    });
  }

  /** Axis-angle (3 floats at offset) -> 3x3 rotation matrix written into `out` at offset. */
  private static rodrigues(aa: Float32Array, ai: number, out: Float32Array, oi: number) {
    const rx = aa[ai], ry = aa[ai + 1], rz = aa[ai + 2];
    const theta = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (theta < 1e-8) {
      out[oi] = 1; out[oi + 1] = 0; out[oi + 2] = 0;
      out[oi + 3] = 0; out[oi + 4] = 1; out[oi + 5] = 0;
      out[oi + 6] = 0; out[oi + 7] = 0; out[oi + 8] = 1;
      return;
    }
    const kx = rx / theta, ky = ry / theta, kz = rz / theta;
    const s = Math.sin(theta), c = Math.cos(theta), t = 1 - c;
    // R = I + sin(theta) K + (1-cos(theta)) K^2, K = skew(k)
    out[oi] = t * kx * kx + c;
    out[oi + 1] = t * kx * ky - s * kz;
    out[oi + 2] = t * kx * kz + s * ky;
    out[oi + 3] = t * kx * ky + s * kz;
    out[oi + 4] = t * ky * ky + c;
    out[oi + 5] = t * ky * kz - s * kx;
    out[oi + 6] = t * kx * kz - s * ky;
    out[oi + 7] = t * ky * kz + s * kx;
    out[oi + 8] = t * kz * kz + c;
  }

  /** Recompute shaped template + rest-pose joints (depends only on betas/expression). */
  private updateShape(params: SmplxParams) {
    const V3 = this.numVerts * 3;
    const C = this.numBetas + this.numExpr;
    const sd = this.shapedirs;
    const vt = this.vTemplate;
    const vShaped = this.vShaped;

    // Pack shape coefficients into a contiguous vector [betas..., expression...].
    const coeff = new Float32Array(C);
    for (let b = 0; b < this.numBetas; b++) coeff[b] = params.betas[b] || 0;
    for (let e = 0; e < this.numExpr; e++) coeff[this.numBetas + e] = params.expression[e] || 0;

    for (let row = 0; row < V3; row++) {
      let acc = vt[row];
      const base = row * C;
      for (let c = 0; c < C; c++) acc += sd[base + c] * coeff[c];
      vShaped[row] = acc;
    }

    // Rest-pose joints: J = J_regressor @ v_shaped  -> (J,3)
    const reg = this.jRegressor;
    const joints = this.joints;
    const V = this.numVerts;
    for (let j = 0; j < this.numJoints; j++) {
      let x = 0, y = 0, z = 0;
      const rb = j * V;
      for (let v = 0; v < V; v++) {
        const w = reg[rb + v];
        if (w === 0) continue;
        const vb = v * 3;
        x += w * vShaped[vb];
        y += w * vShaped[vb + 1];
        z += w * vShaped[vb + 2];
      }
      joints[j * 3] = x;
      joints[j * 3 + 1] = y;
      joints[j * 3 + 2] = z;
    }
  }

  /** Build per-joint skinning matrices from the kinematic chain. */
  private updateKinematics() {
    const J = this.numJoints;
    const rot = this.rotMats;
    const joints = this.joints;
    const parents = this.parents;

    // Global 4x4 transforms, stored row-major in `global`.
    const global = new Float32Array(J * 16);

    for (let j = 0; j < J; j++) {
      const p = parents[j];
      const rb = j * 9;
      // Relative joint translation = J[j] - J[parent].
      let tx = joints[j * 3], ty = joints[j * 3 + 1], tz = joints[j * 3 + 2];
      if (p >= 0) {
        tx -= joints[p * 3];
        ty -= joints[p * 3 + 1];
        tz -= joints[p * 3 + 2];
      }
      // Local transform L (rotation + relative translation).
      const L0 = rot[rb], L1 = rot[rb + 1], L2 = rot[rb + 2], L3 = tx;
      const L4 = rot[rb + 3], L5 = rot[rb + 4], L6 = rot[rb + 5], L7 = ty;
      const L8 = rot[rb + 6], L9 = rot[rb + 7], L10 = rot[rb + 8], L11 = tz;

      const gb = j * 16;
      if (p < 0) {
        global[gb] = L0; global[gb + 1] = L1; global[gb + 2] = L2; global[gb + 3] = L3;
        global[gb + 4] = L4; global[gb + 5] = L5; global[gb + 6] = L6; global[gb + 7] = L7;
        global[gb + 8] = L8; global[gb + 9] = L9; global[gb + 10] = L10; global[gb + 11] = L11;
        global[gb + 12] = 0; global[gb + 13] = 0; global[gb + 14] = 0; global[gb + 15] = 1;
      } else {
        const pb = p * 16;
        // global[j] = global[parent] @ L  (both upper-3x4; bottom row [0,0,0,1])
        const a0 = global[pb], a1 = global[pb + 1], a2 = global[pb + 2], a3 = global[pb + 3];
        const a4 = global[pb + 4], a5 = global[pb + 5], a6 = global[pb + 6], a7 = global[pb + 7];
        const a8 = global[pb + 8], a9 = global[pb + 9], a10 = global[pb + 10], a11 = global[pb + 11];
        global[gb] = a0 * L0 + a1 * L4 + a2 * L8;
        global[gb + 1] = a0 * L1 + a1 * L5 + a2 * L9;
        global[gb + 2] = a0 * L2 + a1 * L6 + a2 * L10;
        global[gb + 3] = a0 * L3 + a1 * L7 + a2 * L11 + a3;
        global[gb + 4] = a4 * L0 + a5 * L4 + a6 * L8;
        global[gb + 5] = a4 * L1 + a5 * L5 + a6 * L9;
        global[gb + 6] = a4 * L2 + a5 * L6 + a6 * L10;
        global[gb + 7] = a4 * L3 + a5 * L7 + a6 * L11 + a7;
        global[gb + 8] = a8 * L0 + a9 * L4 + a10 * L8;
        global[gb + 9] = a8 * L1 + a9 * L5 + a10 * L9;
        global[gb + 10] = a8 * L2 + a9 * L6 + a10 * L10;
        global[gb + 11] = a8 * L3 + a9 * L7 + a10 * L11 + a11;
        global[gb + 12] = 0; global[gb + 13] = 0; global[gb + 14] = 0; global[gb + 15] = 1;
      }
    }

    // rel_transforms = global - [0 | global_rot @ J_rest]  (removes the rest pose).
    const rel = this.relTransforms;
    const pj = this.posedJoints;
    for (let j = 0; j < J; j++) {
      const gb = j * 16;
      pj[j * 3] = global[gb + 3];
      pj[j * 3 + 1] = global[gb + 7];
      pj[j * 3 + 2] = global[gb + 11];
      const jx = joints[j * 3], jy = joints[j * 3 + 1], jz = joints[j * 3 + 2];
      const fx = global[gb] * jx + global[gb + 1] * jy + global[gb + 2] * jz;
      const fy = global[gb + 4] * jx + global[gb + 5] * jy + global[gb + 6] * jz;
      const fz = global[gb + 8] * jx + global[gb + 9] * jy + global[gb + 10] * jz;
      for (let k = 0; k < 16; k++) rel[gb + k] = global[gb + k];
      rel[gb + 3] = global[gb + 3] - fx;
      rel[gb + 7] = global[gb + 7] - fy;
      rel[gb + 11] = global[gb + 11] - fz;
    }
  }

  /**
   * Compute final posed + shaped vertex positions for the given parameters.
   * Returns a Float32Array of length V*3 (reused buffer; copy if you need to keep it).
   */
  forward(params: SmplxParams, opts: ForwardOptions = { poseBlendShapes: true }): Float32Array {
    const V = this.numVerts;
    const V3 = V * 3;
    const J = this.numJoints;

    // 1. Shape + rest joints (cached unless shape/expression changed).
    const shapeKey =
      params.betas.join(',') + '|' + params.expression.join(',');
    if (this.shapeDirty || shapeKey !== this.lastShapeKey) {
      this.updateShape(params);
      this.lastShapeKey = shapeKey;
      this.shapeDirty = false;
    }

    // 2. Per-joint rotation matrices from axis-angle pose.
    for (let j = 0; j < J; j++) {
      SmplxModel.rodrigues(params.pose, j * 3, this.rotMats, j * 9);
    }

    // 3. Pose-corrective blend shapes: v_posed = v_shaped + posedirs @ (R_j - I).
    const vPosed = this.vPosed;
    if (opts.poseBlendShapes) {
      // pose_feature: for joints 1..J-1, (R - I) row-major -> 486 entries.
      const feat = new Float32Array((J - 1) * 9);
      for (let j = 1; j < J; j++) {
        const rb = j * 9;
        const fb = (j - 1) * 9;
        for (let k = 0; k < 9; k++) feat[fb + k] = this.rotMats[rb + k];
        feat[fb] -= 1; feat[fb + 4] -= 1; feat[fb + 8] -= 1; // subtract identity
      }
      const pd = this.posedirs;
      const P = feat.length; // 486
      for (let row = 0; row < V3; row++) {
        let acc = this.vShaped[row];
        const base = row * P;
        for (let p = 0; p < P; p++) acc += pd[base + p] * feat[p];
        vPosed[row] = acc;
      }
    } else {
      vPosed.set(this.vShaped);
    }

    // 4. Kinematic chain -> skinning matrices.
    this.updateKinematics();

    // 5. Linear blend skinning: blend per-joint transforms by skin weights, apply.
    const w = this.weights;
    const rel = this.relTransforms;
    const out = this.outPositions;
    for (let v = 0; v < V; v++) {
      const wb = v * J;
      // Accumulate weighted 3x4 transform.
      let m0 = 0, m1 = 0, m2 = 0, m3 = 0;
      let m4 = 0, m5 = 0, m6 = 0, m7 = 0;
      let m8 = 0, m9 = 0, m10 = 0, m11 = 0;
      for (let j = 0; j < J; j++) {
        const weight = w[wb + j];
        if (weight === 0) continue;
        const tb = j * 16;
        m0 += weight * rel[tb]; m1 += weight * rel[tb + 1]; m2 += weight * rel[tb + 2]; m3 += weight * rel[tb + 3];
        m4 += weight * rel[tb + 4]; m5 += weight * rel[tb + 5]; m6 += weight * rel[tb + 6]; m7 += weight * rel[tb + 7];
        m8 += weight * rel[tb + 8]; m9 += weight * rel[tb + 9]; m10 += weight * rel[tb + 10]; m11 += weight * rel[tb + 11];
      }
      const vb = v * 3;
      const px = vPosed[vb], py = vPosed[vb + 1], pz = vPosed[vb + 2];
      out[vb] = m0 * px + m1 * py + m2 * pz + m3;
      out[vb + 1] = m4 * px + m5 * py + m6 * pz + m7;
      out[vb + 2] = m8 * px + m9 * py + m10 * pz + m11;
    }
    return out;
  }
}
