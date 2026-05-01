import * as THREE from 'three';
import { World } from './world/world.js';
import { Weapons } from './systems/weapons.js';
import { DustField } from './systems/dust.js';
import { applyPlayerFlight } from './systems/flightControl.js';
import { integrateEntity } from './systems/physics.js';
import { PlayerActions } from './systems/playerActions.js';
import * as Input from './systems/input.js';
import * as Actions from './ai/actions.js';
import { isHostile } from './core/factions.js';
import { HUD } from './ui/hud.js';
import { createComposer } from './render/postfx.js';
import { hashSeed } from './core/rng.js';

// Top-level game controller.
export class Game {
  constructor(canvas, panels) {
    this.canvas = canvas;
    this.panels = panels;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.5, 200000);

    // Lights — keep simple. The nebula skybox feeds environment IBL.
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(1, 0.5, 0.7);
    this.scene.add(dir);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    this.dust = null;
    this.world = null;
    this.weapons = null;
    this.hud = null;
    this.playerActions = null;
    this.composer = null;
    this.bloom = null;

    this.paused = false;
    this.running = false;
    this.lastT = 0;
    this.cameraMode = 'chase'; // 'chase' | 'cockpit' | 'free'
    this._cameraOrbit = new THREE.Vector3(0, 8, 28);
    this._fovLerp = 72;

    Input.initInput(canvas);
    window.addEventListener('resize', () => this._resize());
  }

  start(seedString) {
    const seed = hashSeed(seedString);
    // Reset world + scene if reloading.
    if (this.world) this._teardown();

    this.world = new World(this.scene, { seed });
    this.world.generate();

    // Hook up cross-cutting helpers used by AI.
    this.world.findNearestHostile = (e, range) => this.world.closest(e, x =>
      x.kind === 'ship' && x.alive && isHostile(e.faction, x.faction), range
    );
    this.world.world = this.world; // self-ref convenience for AI

    this.weapons = new Weapons(this.world, this.scene);
    this.world.weapons = this.weapons;

    // Push Think onto every AI ship — LT-style.
    for (const e of this.world.entities) {
      if (e.kind !== 'ship' || e === this.world.player) continue;
      e.pushAction(Actions.Think());
    }

    // Friendly escort wing for the player. LT spawns 100; we do 4.
    for (let i = 0; i < 4; i++) {
      const escort = this.world._spawnAIShip('Coalition');
      escort.name = `Wingman ${i+1}`;
      const offset = new THREE.Vector3(
        (i % 2 === 0 ? -1 : 1) * (40 + i * 20),
        ((i % 2) - 0.5) * 12,
        -30 - Math.floor(i/2) * 18
      );
      escort.position.copy(this.world.player.position).add(offset);
      escort.pushAction(Actions.Escort(this.world.player, offset));
    }

    this.dust = new DustField(this.scene, { count: 1500, cell: 600 });

    // Mining laser visuals — a single shared LineSegments.
    this._laserSegments = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xff8a3d, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    this.scene.add(this._laserSegments);

    this.hud = new HUD(this.world, this.camera);
    this.hud.show();
    this.hud.setObjective('Find ore. Trade. Survive.');
    this.world.log(`Welcome to ${this.world.systemName}. Seed ${seed >>> 0}.`, 'good');

    this.playerActions = new PlayerActions(this.world, this.weapons, this.panels);

    const { composer, bloom } = createComposer(this.renderer, this.scene, this.camera);
    this.composer = composer; this.bloom = bloom;

    this._resize();
    this.running = true;
    this.paused = false;
    this.lastT = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _teardown() {
    // Drop all entity meshes from the scene.
    for (const e of this.world.entities) {
      if (e.mesh) this.scene.remove(e.mesh);
    }
    if (this.dust) this.scene.remove(this.dust.points);
    if (this._laserSegments) this.scene.remove(this._laserSegments);
    this.world = null;
  }

  pause() { this.paused = true; this.panels.showPause(); Input.releasePointer(); }
  resume() { this.paused = false; this.panels.hidePause(); }
  quit() {
    this.running = false;
    if (this.world) this._teardown();
    if (this.hud) this.hud.hide();
    this.scene.background = null;
    this.scene.environment = null;
    this.panels.hidePause();
    this.panels.closeMap?.();
    this.panels.closeTrade?.();
    this.panels.showMenu();
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloom)    this.bloom.setSize(w, h);
  }

  _loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this._loop);

    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    Input.consumeFrameInput();

    // Global shortcuts.
    if (Input.pressed('Escape')) {
      if (this.panels.isMapOpen()) { this.panels.closeMap(); }
      else if (this.paused) this.resume();
      else this.pause();
    }
    if (Input.pressed('KeyM') && !this.paused) {
      if (this.panels.isMapOpen()) this.panels.closeMap();
      else this.panels.openMap(this.world);
    }
    if (Input.pressed('KeyV') && !this.paused) {
      this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' :
                        this.cameraMode === 'cockpit' ? 'far' : 'chase';
      this.world.log(`Camera: ${this.cameraMode}`, 'good');
    }

    if (!this.paused) {
      this._step(dt);
    }

    this.composer.render();
    Input.endFrameInput();
  }

  _step(dt) {
    const world = this.world;
    if (!world) return;
    world.elapsed += dt;

    // --- Player input → flight ---
    if (this.playerActions.mode !== 'docked' && world.player.alive) {
      applyPlayerFlight(world.player, dt);
      this.playerActions.update(dt);
    }

    // --- AI tick ---
    for (const e of world.entities) {
      if (e.kind !== 'ship' || e === world.player || !e.alive) continue;
      const top = e.topAction();
      if (top) top.onUpdateActive(e, dt, world);
      // Re-tick the persistent Think action at the bottom (so it can push new
      // jobs while a sub-action runs on top). Mirrors LT's Think doing the
      // overarching "manage assets" pass while subordinate actions execute.
      const root = e.actions[0];
      if (root && root !== top && root.name === 'Think') {
        root.onUpdateActive(e, dt, world);
      }
    }

    // --- Physics ---
    for (const e of world.entities) integrateEntity(e, dt);

    // --- Spin / animate ---
    for (const e of world.entities) {
      if (e.kind === 'station' && e.mesh) {
        e.mesh.rotateY((e.mesh.userData.spinSpeed || 0.1) * dt);
      } else if (e.kind === 'planet' && e.mesh) {
        e.mesh.rotateY(0.02 * dt);
      } else if (e.kind === 'asteroid' && e.mesh) {
        e.mesh.rotateY(0.05 * dt);
      } else if (e.kind === 'ship' && e.mesh && e.mesh.userData.engineGroup) {
        // Pulse engines based on speed/throttle
        const v = e.velocity.length();
        const pulse = 0.7 + 0.3 * Math.sin(world.elapsed * 12);
        const intensity = 0.4 + Math.min(1, v / 300) * 1.3 * pulse;
        for (const g of e.mesh.userData.engineGroup.children) {
          g.material.opacity = Math.min(1, 0.6 + intensity * 0.4);
          g.scale.setScalar(0.7 + intensity * 0.6);
        }
      }
    }

    // --- Weapons ---
    this.weapons.update(dt);

    // Update mining-laser segments visuals.
    const lasers = this.weapons.getLaserSegments();
    if (lasers.length === 0) {
      this._laserSegments.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    } else {
      const arr = new Float32Array(lasers.length * 6);
      for (let i = 0; i < lasers.length; i++) {
        const l = lasers[i];
        arr[i*6+0] = l.from.x; arr[i*6+1] = l.from.y; arr[i*6+2] = l.from.z;
        arr[i*6+3] = l.to.x;   arr[i*6+4] = l.to.y;   arr[i*6+5] = l.to.z;
      }
      this._laserSegments.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      this._laserSegments.geometry.attributes.position.needsUpdate = true;
    }

    // Cull destroyed entities. Player respawns instead of being removed so HUD stays valid.
    for (let i = world.entities.length - 1; i >= 0; i--) {
      const e = world.entities[i];
      if (e.alive) continue;
      if (e === world.player) { this._respawnPlayer(); continue; }
      if (e.kind === 'ship' || e.kind === 'asteroid') {
        if (e.mesh) this.scene.remove(e.mesh);
        world.entities.splice(i, 1);
      }
    }

    // --- Dust + camera ---
    this._updateCamera(dt);
    this.dust.update(this.camera);

    // FOV easing for boost feel.
    const targetFov = world.player && world.player.boost > 1.5 ? 86 : 72;
    this._fovLerp += (targetFov - this._fovLerp) * Math.min(1, 4 * dt);
    this.camera.fov = this._fovLerp;
    this.camera.updateProjectionMatrix();

    // --- HUD ---
    this.hud.update(dt, this.playerActions.mode);
  }

  _respawnPlayer() {
    const world = this.world;
    // Reuse the existing player record but restore.
    world.log('Hull breach! Emergency respawn at station.', 'bad');
    const station = world.station;
    const p = world.player;
    p.alive = true;
    p.hull = p.maxHull * 0.5;
    p.shield = p.maxShield;
    p.energy = p.maxEnergy;
    p.position.copy(station ? station.position : new THREE.Vector3()).add(new THREE.Vector3(400, 0, 0));
    p.velocity.set(0,0,0);
    if (p.mesh && !this.scene.children.includes(p.mesh)) this.scene.add(p.mesh);
    // Slight credit penalty.
    p.credits = Math.max(0, (p.credits | 0) - 250);
  }

  _updateCamera(dt) {
    const p = this.world.player;
    if (!p) return;

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion);

    let desired;
    let lookAt = p.position.clone().addScaledVector(fwd, 60);
    if (this.cameraMode === 'cockpit') {
      desired = p.position.clone().addScaledVector(fwd, 4).addScaledVector(up, 4);
    } else if (this.cameraMode === 'far') {
      desired = p.position.clone().addScaledVector(fwd, -60).addScaledVector(up, 24);
    } else {
      // Chase
      desired = p.position.clone().addScaledVector(fwd, -32).addScaledVector(up, 10);
    }
    // Smooth follow.
    this.camera.position.lerp(desired, Math.min(1, 8 * dt));
    this.camera.lookAt(lookAt);

    // Bank into roll for a little drama.
    this.camera.up.copy(up);
  }
}
