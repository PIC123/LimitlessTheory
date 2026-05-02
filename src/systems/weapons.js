import * as THREE from 'three';
import * as Audio from './audio.js';

// Bolt + mining-laser systems. Pools are kept tight so a few hundred shots in flight
// stay performant. Mirrors LT's Pulse / Turret pairing without the full socket model.

export class Weapons {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.bolts = [];
    this.lasers = []; // active mining-laser visuals (per shot, frame)
    this.explosions = [];

    // Pre-built materials for bolts (color depends on faction).
    this._boltMat = {
      Player:    this._makeBoltMat(0x00e7ff),
      Coalition: this._makeBoltMat(0x6dffa0),
      Pirates:   this._makeBoltMat(0xff476a),
      Traders:   this._makeBoltMat(0xffd23d)
    };
    this._boltGeo = new THREE.CylinderGeometry(0.7, 0.7, 16, 6, 1, true);
    this._boltGeo.rotateX(Math.PI / 2);

    this._laserGeo = new THREE.BufferGeometry();
    this._laserPos = new Float32Array(6);
    this._laserGeo.setAttribute('position', new THREE.BufferAttribute(this._laserPos, 3));
    this._laserMat = new THREE.LineBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  _makeBoltMat(color) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
  }

  fireBolt(shooter, target) {
    const w = shooter.weapon;
    if (w.cooldown > 0 || shooter.energy < w.energy) return;
    w.cooldown = w.rate;
    shooter.energy -= w.energy;

    // Lead the target by predicting its position.
    const dir = new THREE.Vector3().subVectors(target.position, shooter.position);
    const dist = dir.length();
    const t = dist / w.speed;
    const aim = new THREE.Vector3().copy(target.position).addScaledVector(target.velocity, t);
    aim.sub(shooter.position).normalize();

    const mat = this._boltMat[shooter.faction] || this._boltMat.Coalition;
    const mesh = new THREE.Mesh(this._boltGeo, mat);
    mesh.position.copy(shooter.position).addScaledVector(aim, 12);
    mesh.lookAt(mesh.position.clone().add(aim));

    this.scene.add(mesh);
    this.bolts.push({
      mesh,
      pos: mesh.position.clone(),
      dir: aim,
      speed: w.speed,
      damage: w.dmg,
      ttl: w.range / w.speed,
      shooter,
      shooterFaction: shooter.faction
    });
    // Spatial-ish: only audible if the shooter is the player or close to them.
    const player = this.world.player;
    if (shooter === player) Audio.fire();
    else if (player && shooter.position.distanceToSquared(player.position) < 1500*1500) {
      Audio.fire();
    }
  }

  fireMiner(shooter, asteroid) {
    const m = shooter.miner;
    if (m.cooldown > 0 || shooter.energy < m.energy) return;
    m.cooldown = m.rate;
    shooter.energy -= m.energy;

    asteroid.applyDamage(m.dmg, shooter);
    this.lasers.push({ from: shooter.position.clone(), to: asteroid.position.clone(), ttl: 0.18 });

    // If the asteroid breaks, dump its yield into the shooter's hold (or world).
    if (!asteroid.alive && asteroid.metadata.ore) {
      const taken = shooter.cargoAdd(asteroid.metadata.ore, asteroid.metadata.oreAmount);
      if (shooter === this.world.player && taken > 0) {
        this.world.log(`Mined ${taken} ${asteroid.metadata.ore}`, 'good');
      }
      this.spawnExplosion(asteroid.position, 30, 0xb89c78);
      Audio.explode(0.7);
    }
  }

  spawnExplosion(at, scale, color = 0xff8a3d) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    const sprite = new THREE.Mesh(new THREE.SphereGeometry(scale, 12, 8), mat);
    sprite.position.copy(at);
    this.scene.add(sprite);
    this.explosions.push({ mesh: sprite, age: 0, life: 0.8, scale });
  }

  update(dt) {
    // Bolts.
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.ttl -= dt;
      const step = b.speed * dt;
      b.pos.addScaledVector(b.dir, step);
      b.mesh.position.copy(b.pos);

      let hit = null;
      // Check entities. Cheap O(n) but n is small.
      for (const e of this.world.entities) {
        if (!e.alive || e === b.shooter) continue;
        if (e.kind !== 'ship' && e.kind !== 'asteroid') continue;
        const d2 = e.position.distanceToSquared(b.pos);
        const r = (e.radius + 6); // padding
        if (d2 < r * r) { hit = e; break; }
      }
      if (hit) {
        const shieldedBefore = hit.shield > 0;
        hit.applyDamage(b.damage, b.shooter);
        this.spawnExplosion(b.pos, 6, b.mesh.material.color.getHex());
        const player = this.world.player;
        const audibleClose = !player || hit.position.distanceToSquared(player.position) < 1800*1800;
        if (audibleClose) {
          if (shieldedBefore && hit.shield > 0) Audio.shieldHit();
          else Audio.boltHit();
        }
        if (!hit.alive && hit.kind === 'ship') {
          this.spawnExplosion(hit.position, 38, 0xff8a3d);
          if (audibleClose) Audio.explode(hit === this.world.player ? 1.6 : 1.0);
        }
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
        continue;
      }

      if (b.ttl <= 0) {
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }

    // Mining lasers — drawn fresh each call from a pool.
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.ttl -= dt;
      if (l.ttl <= 0) this.lasers.splice(i, 1);
    }

    // Explosions.
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += dt;
      const t = ex.age / ex.life;
      ex.mesh.scale.setScalar(0.4 + t * 1.6);
      ex.mesh.material.opacity = Math.max(0, 1 - t);
      if (t >= 1) {
        this.scene.remove(ex.mesh);
        ex.mesh.geometry.dispose();
        ex.mesh.material.dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  // Returns line segment list to render mining lasers each frame.
  getLaserSegments() { return this.lasers; }
}
