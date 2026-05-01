import * as THREE from 'three';
import * as Input from './input.js';
import { isHostile } from '../core/factions.js';

// Player input that produces "actions" (firing, mining, target lock, dock).
// LT split this into several Controls; we collapse for clarity since the player
// is a single ship, not the full fleet UI.

export class PlayerActions {
  constructor(world, weapons, ui) {
    this.world = world;
    this.weapons = weapons;
    this.ui = ui;
    this.docked = null;
    this.mode = 'flight'; // 'flight' | 'docked'
  }

  // Cycle target: T = nearest hostile, Y = nearest neutral/asteroid, R = clear.
  update(dt) {
    const p = this.world.player;
    if (!p?.alive) return;

    if (Input.pressed('KeyT')) {
      const target = this.world.findNearestHostile(p, 8000) || this.world.closest(p, e => e.kind === 'ship', 8000);
      p.target = target;
      if (target) this.world.log(`Targeting ${target.name}`, 'warn');
    }
    if (Input.pressed('KeyY')) {
      const target = this.world.closest(p, e => e.kind === 'asteroid' && e.metadata.ore, 4000);
      p.target = target;
      if (target) this.world.log(`Targeting ${target.name}`, 'good');
    }
    if (Input.pressed('KeyR')) p.target = null;

    // Tab cycles ships
    if (Input.pressed('Tab')) {
      const ships = this.world.entities.filter(e => e.kind === 'ship' && e.alive && e !== p);
      if (ships.length) {
        const idx = ships.indexOf(p.target);
        p.target = ships[(idx + 1) % ships.length];
        this.world.log(`Targeting ${p.target.name}`);
      }
    }

    // Fire weapons (mouse left or Space) — only if a target is locked OR fire forward.
    if (Input.mouseLeft() && this.mode === 'flight') {
      const target = p.target && p.target.alive ? p.target : this._syntheticForwardTarget(p);
      if (target) this.weapons.fireBolt(p, target);
    }

    // Mining laser (mouse right or M).
    if ((Input.mouseRight() || Input.down('KeyM')) && this.mode === 'flight') {
      let target = p.target;
      if (!target || target.kind !== 'asteroid' || !target.alive) {
        target = this.world.closest(p, e => e.kind === 'asteroid' && e.alive, p.miner.range + 200);
      }
      if (target) {
        const dist = p.position.distanceTo(target.position);
        if (dist < p.miner.range + target.radius) {
          this.weapons.fireMiner(p, target);
        }
      }
    }

    // Dock (F): if near a station, pause the world & open trade.
    if (Input.pressed('KeyF')) {
      if (this.mode === 'docked') {
        this.undock();
      } else {
        const station = this.world.closest(p, e => e.kind === 'station', 600);
        if (station) {
          this.dock(station);
        } else {
          this.world.log('No station in range', 'warn');
        }
      }
    }
  }

  dock(station) {
    this.docked = station;
    this.mode = 'docked';
    this.ui.openTrade(station, this.world.player);
    this.world.log(`Docked at ${station.name}`, 'good');
  }
  undock() {
    if (!this.docked) return;
    const p = this.world.player;
    // Push the player slightly away from the station.
    const out = new THREE.Vector3().subVectors(p.position, this.docked.position).normalize();
    p.position.addScaledVector(out, 320);
    p.velocity.copy(out).multiplyScalar(60);
    this.docked = null;
    this.mode = 'flight';
    this.ui.closeTrade();
    this.world.log('Undocked', 'good');
  }

  // For free-fire when no target locked: pick a fake "infinity ahead" target.
  _syntheticForwardTarget(p) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion);
    return {
      alive: true,
      position: p.position.clone().addScaledVector(fwd, 1500),
      velocity: new THREE.Vector3()
    };
  }
}
