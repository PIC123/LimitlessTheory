import * as THREE from 'three';
import * as Input from './input.js';

// Limit Theory's MasterControl was a chained Pitch/Yaw/Roll/Throttle controller mapped
// to mouse + WASD + Q/E. We mimic the same shape, plus a boost (Shift) and brake (X).
// The player ship has dragLinear=0.75, dragAngular=4.0 in line with LT's setDrag.

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

export function applyPlayerFlight(player, dt, opts = {}) {
  const sens = opts.mouseSens ?? 0.0018;

  // Mouse-look rotates ship via pitch (Y) and yaw (X) of the cursor.
  const md = Input.mouseDelta();
  let pitch = -md.y * sens;
  let yaw   = -md.x * sens;
  let roll  = 0;

  if (Input.down('KeyQ')) roll += 1;
  if (Input.down('KeyE')) roll -= 1;

  // Throttle (forward/back). LT used W/S; we mirror.
  let throttleAxis = 0;
  if (Input.down('KeyW')) throttleAxis += 1;
  if (Input.down('KeyS')) throttleAxis -= 1;

  // Strafe.
  let strafeX = 0, strafeY = 0;
  if (Input.down('KeyA')) strafeX -= 1;
  if (Input.down('KeyD')) strafeX += 1;
  if (Input.down('Space')) strafeY += 1;
  if (Input.down('ControlLeft') || Input.down('ControlRight')) strafeY -= 1;

  // Boost / brake. Boost multiplier comes from the equipped engine module.
  const boostMult = player.metadata.boostMult ?? 2.4;
  const boost = Input.down('ShiftLeft') || Input.down('ShiftRight') ? boostMult : 1.0;
  const brake = Input.down('KeyX');

  // Build local axes from current orientation.
  _f.set(0, 0, -1).applyQuaternion(player.quaternion);
  _r.set(1, 0, 0).applyQuaternion(player.quaternion);
  _u.set(0, 1, 0).applyQuaternion(player.quaternion);

  // Apply rotation per-axis. Mirrors LT's separated pitch/yaw/roll controls.
  applyAngular(player, _u, yaw);
  applyAngular(player, _r, pitch);
  applyAngular(player, _f, roll * 1.6 * dt);

  // Apply linear thrust along ship axes.
  const thrust = player.thrust * boost;
  player.boost = boost;
  if (throttleAxis) player.velocity.addScaledVector(_f, throttleAxis * thrust * dt);
  if (strafeX)      player.velocity.addScaledVector(_r, strafeX * thrust * 0.6 * dt);
  if (strafeY)      player.velocity.addScaledVector(_u, strafeY * thrust * 0.6 * dt);

  if (brake) {
    // Strong damping.
    player.velocity.multiplyScalar(Math.exp(-3 * dt));
    player.angularVelocity.multiplyScalar(Math.exp(-6 * dt));
  }

  // Energy drain proportional to thrust.
  const drain = (Math.abs(throttleAxis) + Math.abs(strafeX) + Math.abs(strafeY)) * 4 * boost;
  player.energy = Math.max(0, player.energy - drain * dt);

  // Cap velocity for stability (analogous to LT's drag-limited top speed).
  const maxSpeed = 380 * boost;
  if (player.velocity.lengthSq() > maxSpeed * maxSpeed) {
    player.velocity.setLength(maxSpeed);
  }

  // For UI: throttle level approximation (current speed / max).
  player.metadata.throttlePct = player.velocity.length() / 380;
}

function applyAngular(entity, axis, amount) {
  if (amount === 0) return;
  const q = new THREE.Quaternion().setFromAxisAngle(axis, amount);
  entity.quaternion.premultiply(q).normalize();
}
