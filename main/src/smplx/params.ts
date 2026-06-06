import { SmplxModel } from './smplxModel';
import { SMPLX_NUM_JOINTS, LEFT_HAND_JOINTS, RIGHT_HAND_JOINTS } from './skeleton';

const DEG = Math.PI / 180;

export type JointAngles = Record<number, [number, number, number]>; // degrees, by joint index

export type ParamState = {
  betas: number[]; // length numBetas
  expression: number[]; // length numExpr
  global: [number, number, number]; // degrees
  joints: JointAngles; // degrees, by joint index (body joints only)
  leftHandCurl: number; // degrees applied to left finger joints
  rightHandCurl: number; // degrees applied to right finger joints
  relaxedHands: boolean; // add the model's mean hand pose as the rest pose
};

export function makeInitialState(numBetas: number, numExpr: number): ParamState {
  return {
    betas: new Array(numBetas).fill(0),
    expression: new Array(numExpr).fill(0),
    global: [0, 0, 0],
    joints: {},
    leftHandCurl: 0,
    rightHandCurl: 0,
    relaxedHands: true,
  };
}

/** Build the 55*3 axis-angle pose vector (radians) the model expects. */
export function buildPose(model: SmplxModel, s: ParamState): Float32Array {
  const pose = new Float32Array(SMPLX_NUM_JOINTS * 3);

  // Joint 0 = global orientation.
  pose[0] = s.global[0] * DEG;
  pose[1] = s.global[1] * DEG;
  pose[2] = s.global[2] * DEG;

  // Explicit body joints.
  for (const key of Object.keys(s.joints)) {
    const j = Number(key);
    const a = s.joints[j];
    pose[j * 3] = a[0] * DEG;
    pose[j * 3 + 1] = a[1] * DEG;
    pose[j * 3 + 2] = a[2] * DEG;
  }

  // Relaxed (mean) hand rest pose.
  if (s.relaxedHands) {
    for (let i = 0; i < 45; i++) {
      pose[LEFT_HAND_JOINTS[0] * 3 + i] += model.handsMean[i];
      pose[RIGHT_HAND_JOINTS[0] * 3 + i] += model.handsMean[45 + i];
    }
  }

  // Finger curl: rotate each finger joint about its local flexion axis (z).
  const lc = s.leftHandCurl * DEG;
  const rc = s.rightHandCurl * DEG;
  for (const j of LEFT_HAND_JOINTS) pose[j * 3 + 2] += lc;
  for (const j of RIGHT_HAND_JOINTS) pose[j * 3 + 2] -= rc;

  return pose;
}

export type Preset = { name: string; apply: (s: ParamState) => ParamState };

export const PRESETS: Preset[] = [
  {
    name: 'Neutral',
    apply: (s) => ({ ...s, global: [0, 0, 0], joints: {}, leftHandCurl: 0, rightHandCurl: 0 }),
  },
  {
    name: 'Relaxed',
    apply: (s) => ({
      ...s,
      global: [0, 0, 0],
      joints: { 16: [0, 0, -55], 17: [0, 0, 55], 18: [0, 0, 15], 19: [0, 0, -15] },
      leftHandCurl: 20,
      rightHandCurl: 20,
    }),
  },
  {
    name: 'Wave',
    apply: (s) => ({
      ...s,
      joints: { 16: [0, 0, 40], 17: [0, 0, -40], 19: [-90, 0, 20], 20: [-90, 0, -20] },
      leftHandCurl: 35,
      rightHandCurl: 35,
    }),
  },
  {
    name: 'Sit',
    apply: (s) => ({
      ...s,
      joints: { 1: [-85, 0, 12], 2: [-85, 0, -12], 4: [95, 0, 0], 5: [95, 0, 0] },
    }),
  },
  {
    name: 'T-pose',
    apply: (s) => ({
      ...s,
      joints: { 16: [0, 0, 5], 17: [0, 0, -5] },
      leftHandCurl: 0,
      rightHandCurl: 0,
    }),
  },
];
