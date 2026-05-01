import * as THREE from 'three';

// Volumetric dust particles around the camera, port of LT's Dust entity.
// We keep a fixed cloud of points relative to the camera and re-tile when the
// camera leaves a cell, giving an infinite parallax field with O(1) cost.

export class DustField {
  constructor(scene, opts = {}) {
    this.cell = opts.cell ?? 800;
    this.count = opts.count ?? 1200;
    const positions = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      positions[i3]     = (Math.random() - 0.5) * this.cell;
      positions[i3 + 1] = (Math.random() - 0.5) * this.cell;
      positions[i3 + 2] = (Math.random() - 0.5) * this.cell;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xa8d8ff,
      size: 1.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.origin = new THREE.Vector3();
  }

  update(camera) {
    // Snap dust origin to camera cell so points wrap.
    const cell = this.cell;
    const cx = Math.floor(camera.position.x / cell) * cell;
    const cy = Math.floor(camera.position.y / cell) * cell;
    const cz = Math.floor(camera.position.z / cell) * cell;
    this.points.position.set(cx, cy, cz);
  }
}
