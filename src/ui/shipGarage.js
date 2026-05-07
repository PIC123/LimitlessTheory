// Ship Garage: a self-contained mini Three.js scene that renders inside
// the GARAGE tab of the station UI. Players see their ship in a hangar
// with cyan rim lighting, can drag to rotate, and watch live as they
// flip through hull colors / accent colors / hull styles.
//
// Cost: a second WebGLRenderer that only runs while the tab is visible.
// We pause its frame loop on tab-leave to keep the main composer frame
// rate untouched.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { buildShipMesh } from '../gen/ship.js';

const HULL_PRESETS = [
  { id: 'graphite', label: 'Graphite',  color: 0x2a2f38 },
  { id: 'navy',     label: 'Navy',      color: 0x16243d },
  { id: 'crimson',  label: 'Crimson',   color: 0x3c1218 },
  { id: 'forest',   label: 'Forest',    color: 0x1a3024 },
  { id: 'sand',     label: 'Sand',      color: 0x6e5a3a },
  { id: 'orchid',   label: 'Orchid',    color: 0x32153c },
  { id: 'pearl',    label: 'Pearl',     color: 0xb8c0c8 },
  { id: 'shadow',   label: 'Shadow',    color: 0x0e1014 }
];

const ACCENT_PRESETS = [
  { id: 'cyan',    label: 'Cyan',    color: 0x00e7ff },
  { id: 'orange',  label: 'Orange',  color: 0xff8a3d },
  { id: 'magenta', label: 'Magenta', color: 0xff3da8 },
  { id: 'lime',    label: 'Lime',    color: 0x6dffa0 },
  { id: 'amber',   label: 'Amber',   color: 0xffd23d },
  { id: 'red',     label: 'Red',     color: 0xff476a },
  { id: 'violet',  label: 'Violet',  color: 0xa05dff },
  { id: 'arctic',  label: 'Arctic',  color: 0xcfeaff }
];

const ROLES = [
  { id: 'fighter', label: 'Fighter',  desc: 'Balanced fighter frame.' },
  { id: 'sleek',   label: 'Sleek',    desc: 'Long, narrow racer profile.' },
  { id: 'heavy',   label: 'Heavy',    desc: 'Bulky frame, prouder hull.' },
  { id: 'trader',  label: 'Trader',   desc: 'Cylindrical body, wingless cargo hauler.' }
];

export class ShipGarage {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(0, 6, 26);
    this.camera.lookAt(0, 0, 0);

    // Hangar lighting: a warm key + cool rim, plus a cyan ground glow.
    const key = new THREE.DirectionalLight(0xffe0c0, 1.6);
    key.position.set(8, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4ad8ff, 1.2);
    rim.position.set(-7, 4, -8);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0x9ad6ff, 0x101820, 0.45));

    // Ground glow disc.
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(8, 22, 48),
      new THREE.MeshBasicMaterial({
        color: 0x00e7ff, transparent: true, opacity: 0.18,
        side: THREE.DoubleSide, depthWrite: false, fog: false
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -5;
    this.scene.add(disc);

    // Subtle floor grid for scale.
    const grid = new THREE.GridHelper(40, 16, 0x004a55, 0x002a30);
    grid.position.y = -5.05;
    grid.material.transparent = true;
    grid.material.opacity = 0.4;
    this.scene.add(grid);

    this.shipGroup = new THREE.Group();
    this.scene.add(this.shipGroup);

    this.rng = new RNG(1);             // deterministic so re-renders are stable
    this.appearance = null;
    this.rotation = 0;
    this.dragRotation = 0;
    this.autoSpin = 0.18;              // rad/s

    this._dragging = false;
    this._lastX = 0;
    this._frame = this._frame.bind(this);
    this.running = false;
    this._setupInput();

    // Resize on window changes too — relevant for mobile orientation flips.
    this._resizeBound = () => this._resize();
    window.addEventListener('resize', this._resizeBound);
  }

  static get HULL_PRESETS()   { return HULL_PRESETS; }
  static get ACCENT_PRESETS() { return ACCENT_PRESETS; }
  static get ROLES()          { return ROLES; }

  open(appearance) {
    if (appearance) this.setAppearance(appearance);
    this.running = true;
    // Defer to next animation frame so layout has settled and the canvas
    // has its final size.
    requestAnimationFrame(() => {
      this._resize();
      this._frame();
    });
  }

  close() {
    this.running = false;
  }

  destroy() {
    this.close();
    window.removeEventListener('resize', this._resizeBound);
    if (this.renderer) this.renderer.dispose();
  }

  // Apply a new appearance. The ship mesh is rebuilt from scratch each time;
  // it's cheap enough that a color drag at 60fps would still feel instant.
  setAppearance(a) {
    this.appearance = { ...a };
    while (this.shipGroup.children.length) {
      const c = this.shipGroup.children[0];
      this.shipGroup.remove(c);
    }
    // Use a stable seed so re-rolls with the same role don't reshuffle the
    // greebles every time we click a color.
    this.rng.setSeed((this.appearance.seed >>> 0) || 0xC0FFEE);
    const ship = buildShipMesh(this.rng, {
      role: this.appearance.role || 'fighter',
      size: 8,
      accent: this.appearance.accentColor,
      hullColor: this.appearance.hullColor,
      cockpitColor: this.appearance.cockpitColor,
      trimColor: this.appearance.trimColor
    });
    this.shipGroup.add(ship);
  }

  _frame() {
    if (!this.running) return;
    requestAnimationFrame(this._frame);
    this.rotation += this.autoSpin / 60 + this.dragRotation;
    this.dragRotation *= 0.86;       // ease drag-spin to rest
    this.shipGroup.rotation.y = this.rotation;
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  _setupInput() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      this._lastX = e.clientX;
      try { this.canvas.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      this._lastX = e.clientX;
      this.dragRotation += dx * 0.006;
    });
    const release = (e) => {
      if (!this._dragging) return;
      this._dragging = false;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }
}
