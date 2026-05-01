import * as THREE from 'three';
import { isHostile, isAlly } from '../core/factions.js';

// Direct port of the *shape* of LT's action stack: each action is an object with
// a name and onUpdateActive(entity, dt, world) hook. When the action believes its
// task is done, it calls entity.popAction(). New behaviors can be pushed on top.

const _f = new THREE.Vector3();
const _t = new THREE.Vector3();

// Steers e toward targetPos, aligning the +Z forward to target.
// Mirrors LT's flyToward helper without the full inertial-tensor math.
export function flyToward(e, targetPos, dt, opts = {}) {
  const arriveDist = opts.arriveDist ?? 0;
  const maxSpeed = opts.maxSpeed ?? e.thrust * 4;

  _f.copy(targetPos).sub(e.position);
  const dist = _f.length();
  if (dist < 1e-3) return 0;
  _f.divideScalar(dist);

  // Compute desired ship orientation: forward toward target, up world-up.
  const desiredQuat = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(_t.copy(_f).multiplyScalar(-1).add(e.position), e.position, new THREE.Vector3(0, 1, 0))
  );
  // slerp toward desired.
  e.quaternion.slerp(desiredQuat, Math.min(1, opts.turnRate ?? 2.4 * dt));

  // Apply forward thrust roughly in alignment with current facing.
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(e.quaternion);
  const align = Math.max(0, fwd.dot(_f));
  const speedTarget = Math.min(maxSpeed, Math.max(0, dist - arriveDist) * 1.6);
  const desiredVel = _t.copy(fwd).multiplyScalar(speedTarget * align);
  // Gentle accel.
  e.velocity.lerp(desiredVel, Math.min(1, 1.6 * dt));
  return dist;
}

// ---- MoveTo ----
export function MoveTo(target, range = 60) {
  return {
    name: 'MoveTo',
    target, range,
    onUpdateActive(e, dt, world) {
      if (!target.alive && target.kind !== 'station' && target.kind !== 'planet') {
        e.popAction(); return;
      }
      const dist = flyToward(e, target.position, dt, { arriveDist: range, maxSpeed: e.thrust * 4 });
      if (dist <= range + (target.radius || 0)) e.popAction();
    }
  };
}

// ---- Attack ----
export function Attack(target) {
  let timer = 0, offset = new THREE.Vector3(), radius = 80;
  return {
    name: 'Attack',
    target,
    onUpdateActive(e, dt, world) {
      if (!target.alive) { e.popAction(); return; }
      timer -= dt;
      const distSq = e.position.distanceToSquared(target.position);
      // Re-pick attack offset every few seconds.
      if (timer <= 0) {
        offset.set((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).normalize();
        radius = 60 + Math.random() * 90;
        timer = 4 + Math.random() * 4;
      }
      _t.copy(target.position).addScaledVector(offset, radius);
      flyToward(e, _t, dt, { arriveDist: 30, maxSpeed: e.thrust * 4, turnRate: 3.0 * dt });

      // Fire if facing the target and within range.
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(e.quaternion);
      const dir = _f.copy(target.position).sub(e.position);
      const dist = Math.sqrt(distSq);
      dir.divideScalar(dist);
      const align = fwd.dot(dir);
      if (align > 0.9 && dist < e.weapon.range && e.weapon.cooldown <= 0 && e.energy > e.weapon.energy) {
        world.weapons.fireBolt(e, target);
      }
    }
  };
}

// ---- Mine ----
export function Mine(asteroid) {
  return {
    name: 'Mine',
    target: asteroid,
    onUpdateActive(e, dt, world) {
      if (!asteroid.alive || (e.cargoUsed() >= e.cargoCap)) { e.popAction(); return; }
      const dist = e.position.distanceTo(asteroid.position);
      if (dist > e.miner.range + asteroid.radius) {
        flyToward(e, asteroid.position, dt, { arriveDist: e.miner.range + asteroid.radius * 0.8, maxSpeed: e.thrust * 4 });
        return;
      }
      // Stop and mine.
      e.velocity.multiplyScalar(Math.exp(-3 * dt));
      if (e.miner.cooldown <= 0 && e.energy > e.miner.energy) {
        world.weapons.fireMiner(e, asteroid);
      }
    }
  };
}

// ---- Escort ----
export function Escort(leader, offset) {
  const off = offset.clone();
  return {
    name: 'Escort',
    target: leader,
    onUpdateActive(e, dt, world) {
      if (!leader.alive) { e.popAction(); return; }
      // Look for nearby threats while escorting.
      const threat = world.findNearestHostile(e, 1500);
      if (threat) { e.pushAction(Attack(threat)); return; }
      const target = _t.copy(leader.position).add(off);
      flyToward(e, target, dt, { arriveDist: 40, maxSpeed: e.thrust * 5 });
    }
  };
}

// ---- Wander ----
export function Wander(home, radius = 1500) {
  let dest = null;
  let pickAt = 0;
  return {
    name: 'Wander',
    onUpdateActive(e, dt, world) {
      if (!dest || pickAt <= 0) {
        dest = home.clone().add(new THREE.Vector3(
          (Math.random()-0.5)*radius,
          (Math.random()-0.5)*radius*0.3,
          (Math.random()-0.5)*radius
        ));
        pickAt = 6 + Math.random() * 6;
      }
      pickAt -= dt;
      flyToward(e, dest, dt, { arriveDist: 80, maxSpeed: e.thrust * 2.5 });
    }
  };
}

// ---- Think (top-level AI) ----
// Mirrors LT's Think/Action: every couple seconds, pick a job by payout.
// Pirates prefer Attack; traders prefer Trade; patrols prefer hunting hostiles.
export function Think() {
  let timer = 0;
  return {
    name: 'Think',
    onUpdateActive(e, dt, world) {
      timer -= dt;
      if (timer > 0) return;
      timer = 1.2 + Math.random() * 1.5;

      // Already actively engaged? Don't preempt.
      if (e.actions.length > 1) return;

      if (e.metadata.preferAttack || e.faction === 'Pirates') {
        const target = world.findNearestHostile(e, 4000);
        if (target) { e.pushAction(Attack(target)); return; }
      } else if (e.faction === 'Coalition') {
        const threat = world.findNearestHostile(e, 4500);
        if (threat) { e.pushAction(Attack(threat)); return; }
      } else if (e.faction === 'Traders') {
        // Cycle stations.
        const station = world.world.station;
        if (station) { e.pushAction(MoveTo(station, 280)); return; }
      }

      // Default: wander.
      const home = e.position.clone();
      e.pushAction(Wander(home, 2000));
    }
  };
}
