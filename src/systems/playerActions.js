import * as THREE from 'three';
import * as Input from './input.js';
import * as Touch from './touchControls.js';
import { isHostile } from '../core/factions.js';

// Player input that produces "actions" (firing, mining, target lock, dock).
// LT split this into several Controls; we collapse for clarity since the player
// is a single ship, not the full fleet UI.

export class PlayerActions {
  constructor(world, weapons, ui, game) {
    this.world = world;
    this.weapons = weapons;
    this.ui = ui;
    this.game = game;       // back-pointer for jump / save
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

    // Touch TARGET button: cycle hostile → ore → ships in turn.
    if (Touch.pressed('target')) {
      const hostiles = this.world.entities.filter(e => e.kind === 'ship' && e.alive && e !== p && isHostile(p.faction, e.faction));
      const ores = this.world.entities.filter(e => e.kind === 'asteroid' && e.alive && e.metadata.ore);
      const list = hostiles.length ? hostiles : (ores.length ? ores : []);
      if (list.length) {
        list.sort((a, b) => p.position.distanceToSquared(a.position) - p.position.distanceToSquared(b.position));
        const idx = list.indexOf(p.target);
        p.target = list[(idx + 1) % list.length];
        this.world.log(`Targeting ${p.target.name}`, list === hostiles ? 'warn' : 'good');
      } else {
        p.target = null;
      }
    }

    // Tab cycles ships
    if (Input.pressed('Tab')) {
      const ships = this.world.entities.filter(e => e.kind === 'ship' && e.alive && e !== p);
      if (ships.length) {
        const idx = ships.indexOf(p.target);
        p.target = ships[(idx + 1) % ships.length];
        this.world.log(`Targeting ${p.target.name}`);
      }
    }

    // Fire weapons (mouse left, Space, or touch FIRE).
    if ((Input.mouseLeft() || Touch.btn('fire')) && this.mode === 'flight') {
      const target = p.target && p.target.alive ? p.target : this._syntheticForwardTarget(p);
      if (target) this.weapons.fireBolt(p, target);
    }

    // Mining laser (mouse right, M, or touch MINE).
    if ((Input.mouseRight() || Input.down('KeyM') || Touch.btn('mine')) && this.mode === 'flight') {
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
    // If near a jump gate, jump to its target system instead.
    // If neither, complain.
    if (Input.pressed('KeyF') || Touch.pressed('dock')) {
      if (this.mode === 'docked') {
        this.undock();
      } else {
        // Prefer the closer of the two interactables.
        const station = this.world.closest(p, e => e.kind === 'station', 600);
        const gate    = this.world.closest(p, e => e.kind === 'gate',    700);
        const stationD = station ? p.position.distanceTo(station.position) : Infinity;
        const gateD    = gate    ? p.position.distanceTo(gate.position)    : Infinity;
        if (stationD <= gateD && station) this.dock(station);
        else if (gate)                     this.jump(gate);
        else this.world.log('Nothing in range. Approach a station or gate.', 'warn');
      }
    }
  }

  jump(gate) {
    if (!this.game) return;
    const target = gate.metadata.targetSystemId;
    if (target == null) return;
    const sys = this.game.galaxy.systemById(target);
    this.world.log(`Jumping to ${sys.name}…`, 'good');
    this.game.jumpToSystem(target);
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
