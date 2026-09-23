import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { Rhino3dmLoader } from './vendor/loaders/3DMLoader.js';
import { visibleMeshBounds } from './model-bounds.js';

export class ModelViewport {
  constructor(element, onChange, { initialView = 'print', captureWidth = 1024 } = {}) {
    this.initialView = initialView;
    this.captureWidth = captureWidth;
    this.element = element;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#f5f6f2');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    element.append(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .01, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.enablePan = true;
    this.controls.minZoom = .2;
    this.controls.maxZoom = 8;
    this.controls.addEventListener('change', () => { this.render(); onChange?.(this.angles()); });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8270, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 3.1);
    light.position.set(-4, 8, 6);
    this.scene.add(light);
    this.loader = new Rhino3dmLoader().setLibraryPath('./vendor/rhino3dm/');
    this.loader.setWorkerLimit(2);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(element);
    this.demo();
  }

  demo() {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: '#b9c1b1', roughness: .95, metalness: 0 });
    const dark = new THREE.MeshStandardMaterial({ color: '#6d7665', roughness: .95 });
    const pale = new THREE.MeshStandardMaterial({ color: '#d7ddcf', roughness: .95 });
    const box = (w, h, d, x, y, z, mat = material, angle = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z); mesh.rotation.y = angle; root.add(mesh); return mesh;
    };
    box(3.8, .13, 1.8, 0, .065, 0, dark);
    for (let tower = 0; tower < 2; tower++) {
      const cx = tower ? .94 : -.94;
      const floors = tower ? 35 : 30;
      const baseAngle = tower ? -.09 : .09;
      for (let f = 0; f < floors; f++) {
        const y = .17 + f * .145;
        const taper = 1 - f / floors * .19;
        const shift = (tower ? -1 : 1) * Math.max(0, f - 13) * .012;
        const angle = baseAngle + (tower ? -1 : 1) * f * .004;
        box(1.12 * taper, .132, .98, cx + shift, y + .066, 0, f % 7 < 3 ? dark : material, angle);
        box(1.19 * taper, .025, 1.06, cx + shift, y + .132, 0, pale, angle);
        for (let k = 0; k <= 8; k++) {
          const lx = (k / 8 - .5) * 1.12 * taper;
          const lz = .502;
          box(.012, .136, .018, cx + shift + lx * Math.cos(angle) + lz * Math.sin(angle), y + .066,
            -lx * Math.sin(angle) + lz * Math.cos(angle), pale, angle);
        }
      }
    }
    this.setModel(root);
    return this.info();
  }

  async load(file) {
    if (!/\.3dm$/i.test(file.name)) throw new Error('请选择 Rhino .3dm 文件。');
    this.loader.warnings.length = 0;
    const buffer = await file.arrayBuffer();
    const root = await new Promise((resolve,reject) => this.loader.parse(buffer,resolve,reject));
    const warnings = root.userData.warnings || [];
    let meshes = 0;
    root.traverse(node => {
      if (node.isMesh) {
        meshes++;
        if (!node.geometry.attributes.normal) node.geometry.computeVertexNormals();
        const old = Array.isArray(node.material) ? node.material : [node.material];
        old.forEach(material => material?.dispose());
        node.material = new THREE.MeshStandardMaterial({ color: '#b9c1b1', roughness: .95, side: THREE.DoubleSide });
      } else if (node.isLine || node.isPoints || node.isSprite) node.visible = false;
    });
    if (!meshes) { this.disposeObject(root); throw new Error('文件没有可显示的网格。请在 Rhino 中以着色视图保存并保留渲染网格，或先执行 Mesh。'); }
    const wrapper = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    wrapper.add(root);
    this.setModel(wrapper);
    return { ...this.info(), warnings };
  }

  disposeObject(object) {
    const materials = new Set();
    object.traverse(node => { node.geometry?.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => { if (m) materials.add(m); }); });
    materials.forEach(m => m.dispose());
  }

  setModel(root) {
    const { bounds, meshes } = visibleMeshBounds(root);
    if (!meshes) { this.disposeObject(root); throw new Error('模型没有可显示的网格。请在 Rhino 中开启至少一个网格图层。'); }
    const size = bounds.getSize(new THREE.Vector3());
    const max = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(max) || max < 1e-8) { this.disposeObject(root); throw new Error('模型边界为空或尺寸无效。'); }
    root.position.sub(bounds.getCenter(new THREE.Vector3()));
    const normalized = new THREE.Group(); normalized.add(root); normalized.scale.setScalar(5 / max);
    if (this.model) { this.scene.remove(this.model); this.disposeObject(this.model); }
    this.model = normalized; this.scene.add(normalized); normalized.updateMatrixWorld(true);
    this.bounds = visibleMeshBounds(normalized).bounds;
    this.fit(this.initialView);
  }

  info() {
    let meshes = 0, triangles = 0;
    this.model?.traverse(node => { if (node.isMesh) { meshes++; triangles += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3; } });
    return { meshes, triangles: Math.round(triangles) };
  }

  angles() {
    const v = this.camera.position.clone().sub(this.controls.target);
    return { azimuth: Math.atan2(v.x, v.z) * 180 / Math.PI, elevation: Math.asin(v.y / v.length()) * 180 / Math.PI };
  }

  fit(preset) {
    this.controls.target.set(0, 0, 0);
    if (preset === 'front') this.camera.position.set(0, .15, 12);
    else if (preset === 'iso') this.camera.position.set(7, 4.4, 12);
    else if (preset === 'print') this.camera.position.set(3.5, 1.2, 15);
    else this.camera.position.copy(this.camera.position.clone().normalize().multiplyScalar(14));
    this.camera.zoom = 1;
    this.camera.lookAt(this.controls.target);
    this.resize(); this.controls.update();
  }

  resize() {
    const width = Math.max(1, this.element.clientWidth), height = Math.max(1, this.element.clientHeight);
    const aspect = width / height;
    const size = this.bounds?.getSize(new THREE.Vector3()) || new THREE.Vector3(4, 5, 2);
    const span = Math.max(size.y * 1.22, Math.hypot(size.x, size.z) / aspect * 1.16, 5.8);
    this.camera.left = -span * aspect / 2; this.camera.right = span * aspect / 2;
    this.camera.top = span / 2; this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false); this.render();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  capture(mode = 'surface', count = 6) {
    this.controls.update(); this.camera.updateMatrixWorld(true);
    const width = this.captureWidth, height = Math.round(width * this.element.clientHeight / this.element.clientWidth);
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace });
    const shadedTarget = new THREE.WebGLRenderTarget(width, height, { colorSpace: THREE.SRGBColorSpace });
    const material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    const background = this.scene.background, oldMaterial = this.scene.overrideMaterial;
    const clearColor = this.renderer.getClearColor(new THREE.Color()), clearAlpha = this.renderer.getClearAlpha();
    const clips = this.renderer.clippingPlanes;
    const frames = [];
    let surface;
    const shaded = new Uint8Array(width * height * 4);
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const depths = [];
    for (const x of [this.bounds.min.x, this.bounds.max.x]) for (const y of [this.bounds.min.y, this.bounds.max.y]) for (const z of [this.bounds.min.z, this.bounds.max.z]) depths.push(direction.dot(new THREE.Vector3(x, y, z)));
    const low = Math.min(...depths) - .001, high = Math.max(...depths) + .001;
    try {
      this.scene.background = null; this.renderer.clippingPlanes = [];
      this.renderer.setClearColor(0, 0); this.renderer.setRenderTarget(shadedTarget);
      this.renderer.clear(); this.renderer.render(this.scene, this.camera);
      this.renderer.readRenderTargetPixels(shadedTarget, 0, 0, width, height, shaded);
      this.scene.overrideMaterial = material;
      this.renderer.setClearColor(0, 0); this.renderer.setRenderTarget(target);
      this.renderer.clippingPlanes = [];
      this.renderer.clear(); this.renderer.render(this.scene, this.camera);
      surface = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, surface);
      const layers = mode === 'layers' ? count : 0;
      for (let layer = 0; layer < layers; layer++) {
        this.renderer.clippingPlanes = mode === 'layers' ? [
          new THREE.Plane(direction, -(low + (high - low) * layer / layers)),
          new THREE.Plane(direction.clone().negate(), low + (high - low) * (layer + 1) / layers)
        ] : [];
        this.renderer.clear(); this.renderer.render(this.scene, this.camera);
        const pixels = new Uint8Array(width * height * 4);
        this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        frames.push(pixels);
      }
      if (mode !== 'layers') frames.push(surface);
    } finally {
      this.renderer.setRenderTarget(null); this.renderer.setClearColor(clearColor, clearAlpha);
      this.renderer.clippingPlanes = clips; this.scene.background = background;
      this.scene.overrideMaterial = oldMaterial; target.dispose(); shadedTarget.dispose(); material.dispose(); this.render();
    }
    return { width, height, frames, surface, shaded, angles: this.angles() };
  }
}
