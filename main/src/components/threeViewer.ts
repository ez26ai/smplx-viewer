import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SmplxModel } from '../smplx/smplxModel';
import { JOINT_NAMES } from '../smplx/skeleton';

export type DisplayOptions = {
  wireframe: boolean;
  showSkeleton: boolean;
  meshOpacity: number;
};

export class ThreeViewer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.MeshStandardMaterial;
  private skeletonGroup: THREE.Group;
  private raf = 0;
  private resizeObserver: ResizeObserver;
  private framed = false;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / container.clientHeight,
      0.01,
      100
    );
    this.camera.position.set(0, 0.1, 3.0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, -0.15, 0);
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 12;

    // Lighting: a warm key, cool fill, and a rim for silhouette separation.
    const hemi = new THREE.HemisphereLight(0xdfe7ff, 0x2a2622, 0.55);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff2e0, 2.6);
    key.position.set(2.5, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 2;
    key.shadow.camera.bottom = -2;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.6);
    fill.position.set(-3, 1.5, 1);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd9a8, 1.1);
    rim.position.set(0, 2.5, -3.5);
    this.scene.add(rim);

    // Ground: a shadow-catching plane plus a faint grid.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.18;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(20, 40, 0x3a4a6a, 0x232a3a);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    grid.position.y = -1.18;
    this.scene.add(grid);

    this.material = new THREE.MeshStandardMaterial({
      color: 0xc9a98c,
      roughness: 0.62,
      metalness: 0.04,
      flatShading: false,
      transparent: true,
      opacity: 1,
    });

    this.skeletonGroup = new THREE.Group();
    this.skeletonGroup.visible = false;
    this.scene.add(this.skeletonGroup);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.animate = this.animate.bind(this);
    this.raf = requestAnimationFrame(this.animate);
  }

  /** Initialize geometry from a freshly loaded model (sets faces once). */
  setModel(model: SmplxModel, positions: Float32Array) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.geometry?.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    geo.setIndex(new THREE.BufferAttribute(model.faces, 1));
    geo.computeVertexNormals();
    this.geometry = geo;

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    this.buildSkeleton(model);
    this.framed = false;
    this.frameToObject();
  }

  /** Update vertex positions (and skeleton) on each parameter change. */
  updatePositions(positions: Float32Array, model: SmplxModel) {
    if (!this.geometry) return;
    const attr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    (attr.array as Float32Array).set(positions);
    attr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
    if (this.skeletonGroup.visible) this.updateSkeleton(model);
  }

  private jointSpheres: THREE.Mesh[] = [];
  private boneLines: THREE.Line | null = null;

  private buildSkeleton(model: SmplxModel) {
    this.skeletonGroup.clear();
    this.jointSpheres = [];
    const sphereGeo = new THREE.SphereGeometry(0.012, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x4fd1ff });
    for (let j = 0; j < model.numJoints; j++) {
      const s = new THREE.Mesh(sphereGeo, sphereMat);
      this.jointSpheres.push(s);
      this.skeletonGroup.add(s);
    }
    const lineGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(model.numJoints * 2 * 3);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.boneLines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x7fe0ff })
    );
    this.skeletonGroup.add(this.boneLines);
    this.updateSkeleton(model);
  }

  private updateSkeleton(model: SmplxModel) {
    const pj = model.posedJoints;
    for (let j = 0; j < model.numJoints; j++) {
      this.jointSpheres[j]?.position.set(pj[j * 3], pj[j * 3 + 1], pj[j * 3 + 2]);
    }
    if (this.boneLines) {
      const arr = (this.boneLines.geometry.getAttribute('position') as THREE.BufferAttribute)
        .array as Float32Array;
      let k = 0;
      for (let j = 0; j < model.numJoints; j++) {
        const p = model.parents[j];
        if (p < 0) continue;
        arr[k++] = pj[j * 3]; arr[k++] = pj[j * 3 + 1]; arr[k++] = pj[j * 3 + 2];
        arr[k++] = pj[p * 3]; arr[k++] = pj[p * 3 + 1]; arr[k++] = pj[p * 3 + 2];
      }
      for (; k < arr.length; k++) arr[k] = 0;
      (this.boneLines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    void JOINT_NAMES;
  }

  setDisplayOptions(opts: DisplayOptions) {
    this.material.wireframe = opts.wireframe;
    this.material.opacity = opts.meshOpacity;
    this.material.transparent = opts.meshOpacity < 1;
    this.material.needsUpdate = true;
    this.skeletonGroup.visible = opts.showSkeleton;
  }

  private frameToObject() {
    if (!this.geometry || this.framed) return;
    this.geometry.computeBoundingSphere();
    const s = this.geometry.boundingSphere;
    if (!s) return;
    this.controls.target.copy(s.center);
    const dist = s.radius / Math.sin((this.camera.fov * Math.PI) / 180 / 2);
    this.camera.position.set(s.center.x, s.center.y + 0.05, s.center.z + dist * 1.1);
    this.controls.update();
    this.framed = true;
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  resetCamera() {
    this.framed = false;
    this.frameToObject();
  }

  private animate() {
    this.raf = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.geometry?.dispose();
    this.material.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
