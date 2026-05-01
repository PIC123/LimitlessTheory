// Seeded RNG mirroring the spirit of Limit Theory's RNG.Create(seed): cheap, deterministic,
// with the same kind of helpers (getInt, getDir3, getDisc, getExp, choose, getQuat).

import * as THREE from 'three';

export class RNG {
  constructor(seed = Date.now()) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    // mulberry32 internal state
    this.s = (seed >>> 0) || 1;
  }

  // [0, 1)
  getUniform() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  getUniformRange(a, b) {
    return a + (b - a) * this.getUniform();
  }

  getInt(a, b) {
    return Math.floor(a + this.getUniform() * (b - a + 1));
  }

  getSign() { return this.getUniform() < 0.5 ? -1 : 1; }

  getExp() {
    // exponential-ish; mirrors LT's frequent use of getExp().
    return -Math.log(1 - this.getUniform() * 0.99);
  }

  getErlang(k) {
    let s = 0;
    for (let i = 0; i < k; i++) s += -Math.log(1 - this.getUniform() * 0.99);
    return s;
  }

  choose(arr) {
    if (!arr || !arr.length) return undefined;
    return arr[Math.floor(this.getUniform() * arr.length)];
  }

  // unit vector inside a 2D circle
  getDir2() {
    const a = this.getUniform() * Math.PI * 2;
    return new THREE.Vector2(Math.cos(a), Math.sin(a));
  }

  // unit vector on a 3D sphere
  getDir3() {
    const z = this.getUniformRange(-1, 1);
    const a = this.getUniform() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a));
  }

  // point inside a 2D disc (radius 1)
  getDisc() {
    const r = Math.sqrt(this.getUniform());
    const a = this.getUniform() * Math.PI * 2;
    return new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
  }

  // point inside a unit sphere
  getSphere() {
    return this.getDir3().multiplyScalar(Math.cbrt(this.getUniform()));
  }

  getQuat() {
    const u1 = this.getUniform();
    const u2 = this.getUniform() * Math.PI * 2;
    const u3 = this.getUniform() * Math.PI * 2;
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    return new THREE.Quaternion(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
  }
}

// Hash a string seed (for friendly seed input) into a 32-bit integer.
export function hashSeed(input) {
  if (input == null || input === '') return (Math.random() * 0xffffffff) >>> 0;
  if (typeof input === 'number') return (input >>> 0) || 1;
  let h = 2166136261;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}
