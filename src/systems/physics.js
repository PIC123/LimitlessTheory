import * as THREE from 'three';

// Shared physics integration: linear + angular velocity, drag, mesh sync.
// Mirrors LT's setDrag(linear, angular) approach: we apply exponential damping.

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function integrateEntity(e, dt) {
  if (!e.alive) return;

  // Drag: e^(-drag * dt) per frame.
  if (e.dragLinear)  e.velocity.multiplyScalar(Math.exp(-e.dragLinear * dt));
  if (e.dragAngular) e.angularVelocity.multiplyScalar(Math.exp(-e.dragAngular * dt));

  // Position update.
  e.position.addScaledVector(e.velocity, dt);

  // Angular velocity → quaternion update.
  const w = e.angularVelocity;
  const wLen = w.length();
  if (wLen > 1e-6) {
    _q.setFromAxisAngle(_v.copy(w).divideScalar(wLen), wLen * dt);
    e.quaternion.premultiply(_q).normalize();
  }

  // Sync mesh.
  if (e.mesh) {
    e.mesh.position.copy(e.position);
    e.mesh.quaternion.copy(e.quaternion);
  }

  // Regen.
  if (e.shieldRegen && e.shield < e.maxShield) {
    e.shield = Math.min(e.maxShield, e.shield + e.shieldRegen * dt);
  }
  if (e.energyRegen && e.energy < e.maxEnergy) {
    e.energy = Math.min(e.maxEnergy, e.energy + e.energyRegen * dt);
  }

  if (e.weapon && e.weapon.cooldown > 0) e.weapon.cooldown -= dt;
  if (e.miner && e.miner.cooldown > 0) e.miner.cooldown -= dt;
}
