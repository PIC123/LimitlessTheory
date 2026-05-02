import * as THREE from 'three';
import { World } from './world/world.js';
import { Galaxy } from './world/galaxy.js';
import { Weapons } from './systems/weapons.js';
import { DustField } from './systems/dust.js';
import { applyPlayerFlight } from './systems/flightControl.js';
import { integrateEntity } from './systems/physics.js';
import { PlayerActions } from './systems/playerActions.js';
import * as Input from './systems/input.js';
import * as Touch from './systems/touchControls.js';
import * as Actions from './ai/actions.js';
import { isHostile } from './core/factions.js';
import { HUD } from './ui/hud.js';
import { createComposer } from './render/postfx.js';
import { hashSeed } from './core/rng.js';
import { saveProfile, snapshot } from './core/save.js';

// Top-level game controller. Owns the renderer, scene, current World, Galaxy,
// and the loop. Knows how to swap systems on jump and how to save / load profiles.
export class Game {
  constructor(canvas, panels) {
    this.canvas = canvas;
    this.panels = panels;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.5, 200000);

    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(1, 0.5, 0.7);
    this.scene.add(dir);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    this.dust = null;
    this.galaxy = null;
    this.world = null;
    this.weapons = null;
    this.hud = null;
    this.playerActions = null;
    this.composer = null;
    this.bloom = null;

    // Persisted player state — survives system jumps. Mirrored into the live
    // World.player on every system load.
    this.persistent = null;
    this.visitedSystems = new Set();

    this.paused = false;
    this.running = false;
    this.lastT = 0;
    this.cameraMode = 'chase';
    this._fovLerp = 72;
    this._jumpFlash = 0;

    Input.initInput(canvas);
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._resize());
    }

    this._loop = this._loop.bind(this);
  }

  // ---------- Public lifecycle ----------

  startNewGame(seedString) {
    const galaxySeed = hashSeed(seedString);
    this.galaxy = new Galaxy(galaxySeed, { systemCount: 12 });
    this.persistent = this._defaultProfile(galaxySeed);
    this.visitedSystems = new Set([this.persistent.currentSystemId]);
    this._loadSystem(this.persistent.currentSystemId, { isNewGame: true });
    this._beginRunning();
  }

  loadGame(profile) {
    this.galaxy = new Galaxy(profile.galaxySeed, { systemCount: 12 });
    this.persistent = profile;
    this.visitedSystems = new Set(profile.visitedSystems || [profile.currentSystemId]);
    this._loadSystem(profile.currentSystemId, { fromSave: true });
    this._beginRunning();
  }

  pause() { this.paused = true; this.panels.showPause(); Input.releasePointer(); }
  resume() { this.paused = false; this.panels.hidePause(); }

  quit() {
    this.running = false;
    if (this.world) this._teardown();
    if (this.hud) this.hud.hide();
    Touch.setVisible(false);
    this.scene.background = null;
    this.scene.environment = null;
    this.panels.hidePause();
    this.panels.closeMap?.();
    this.panels.closeTrade?.();
    this.panels.closeGalaxy?.();
    this.panels.showMenu();
  }

  // Persist the current player state into `this.persistent` and write to localStorage.
  saveNow() {
    if (!this.world || !this.galaxy) return false;
    this._captureLiveStateIntoProfile();
    return saveProfile(this.persistent);
  }

  // Initiate a jump to a target system id. Called by player when near a gate, or
  // from the galaxy map for fast-travel debug. Tears down the current system,
  // builds the target system from its seed, and places the player at the
  // inbound gate (the gate that points back to the previous system).
  jumpToSystem(targetSystemId, opts = {}) {
    if (!this.galaxy) return;
    if (targetSystemId === this.world.systemId) return;
    const fromId = this.world.systemId;
    this._captureLiveStateIntoProfile();
    this.persistent.currentSystemId = targetSystemId;
    this.visitedSystems.add(targetSystemId);
    this._loadSystem(targetSystemId, { fromSystemId: fromId });
    this.saveNow();
    this._jumpFlash = 1.0;
  }

  // ---------- Internals ----------

  _defaultProfile(galaxySeed) {
    return {
      galaxySeed,
      currentSystemId: 0,
      visitedSystems: [0],
      player: {
        pos: [0, 0, 0],
        quat: [0, 0, 0, 1],
        vel: [0, 0, 0],
        hull: null, shield: null, energy: 140,
        credits: 2500,
        cargo: {},
        loadout: null,        // null means apply defaultLoadout()
        hangar: []
      }
    };
  }

  _captureLiveStateIntoProfile() {
    const p = this.world?.player;
    if (!p) return;
    const cargo = {};
    for (const [k, v] of p.cargo.entries()) cargo[k] = v;
    this.persistent.player = {
      pos: [p.position.x, p.position.y, p.position.z],
      quat: [p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w],
      vel: [p.velocity.x, p.velocity.y, p.velocity.z],
      hull: p.hull, shield: p.shield, energy: p.energy,
      credits: p.credits | 0,
      cargo,
      loadout: { ...(p.metadata.loadout || {}) },
      hangar: [...(p.metadata.hangar || [])]
    };
    this.persistent.visitedSystems = [...this.visitedSystems];
  }

  _loadSystem(systemId, opts = {}) {
    const sys = this.galaxy.systemById(systemId);

    // Tear down previous world if any.
    if (this.world) this._teardown();

    // Build new world from the system's seed and galaxy context.
    this.world = new World(this.scene, {
      seed: sys.seed,
      galaxy: this.galaxy,
      systemId
    });
    this.world.generate();

    // Cross-cutting AI helpers.
    this.world.findNearestHostile = (e, range) => this.world.closest(e, x =>
      x.kind === 'ship' && x.alive && isHostile(e.faction, x.faction), range
    );
    this.world.world = this.world;

    // Spawn the player at the inbound gate, the station, or the saved position.
    const spawnTransform = this._computeSpawnTransform(opts);
    const profPlayer = this.persistent.player;
    this.world.spawnPlayer({
      position: spawnTransform.position,
      quaternion: spawnTransform.quaternion,
      hull: profPlayer.hull, shield: profPlayer.shield, energy: profPlayer.energy,
      credits: profPlayer.credits,
      cargo: profPlayer.cargo,
      loadout: profPlayer.loadout,
      hangar: profPlayer.hangar
    });

    // Weapons + AI Think + escorts.
    this.weapons = new Weapons(this.world, this.scene);
    this.world.weapons = this.weapons;

    for (const e of this.world.entities) {
      if (e.kind !== 'ship' || e === this.world.player) continue;
      e.pushAction(Actions.Think());
    }

    // Always re-spawn 4 escorts in any system the player enters.
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

    // Dust + laser visuals (per-system).
    this.dust = new DustField(this.scene, { count: 1500, cell: 600 });
    this._laserSegments = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xff8a3d, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    this.scene.add(this._laserSegments);

    // HUD + player actions.
    if (!this.hud) {
      this.hud = new HUD(this.world, this.camera);
    } else {
      this.hud.world = this.world;
      this.hud.camera = this.camera;
    }
    this.hud.show();
    Touch.setVisible(true);
    this.hud.setObjective(this._objectiveForSystem());

    this.playerActions = new PlayerActions(this.world, this.weapons, this.panels, this);

    if (!this.composer) {
      const { composer, bloom } = createComposer(this.renderer, this.scene, this.camera);
      this.composer = composer; this.bloom = bloom;
    } else {
      // RenderPass holds a reference to scene+camera; both unchanged so just trigger size.
    }

    this.visitedSystems.add(systemId);
    this._resize();

    if (opts.isNewGame) {
      this.world.log(`Welcome to ${this.world.systemName}. Galaxy seed ${this.persistent.galaxySeed >>> 0}.`, 'good');
    } else if (opts.fromSystemId != null) {
      this.world.log(`Jump complete — ${this.world.systemName}.`, 'good');
    } else if (opts.fromSave) {
      this.world.log(`Resumed in ${this.world.systemName}.`, 'good');
    }
  }

  _objectiveForSystem() {
    if (this.galaxy.systems.length > 1) {
      return 'Mine. Trade. Find a jump gate. Survive.';
    }
    return 'Find ore. Trade. Survive.';
  }

  // Decide where the player ship spawns when a system is loaded.
  _computeSpawnTransform({ fromSystemId, isNewGame, fromSave }) {
    const sys = this.galaxy.systemById(this.world.systemId);
    const profPlayer = this.persistent.player;

    // 1) On a fresh new-game, start at origin.
    if (isNewGame) {
      return {
        position: new THREE.Vector3(0, 0, 0),
        quaternion: new THREE.Quaternion()
      };
    }

    // 2) Jumping in: place near the inbound gate (the gate that points back to fromSystemId).
    if (fromSystemId != null) {
      const inbound = this.world.gates.find(g => g.metadata.targetSystemId === fromSystemId);
      if (inbound) {
        const out = inbound.position.clone();
        const len = out.length() || 1;
        const dir = out.clone().divideScalar(len);
        // Place player ~600 units in front of the gate (toward system center) and
        // facing toward system center so they emerge flying inward.
        const pos = out.clone().addScaledVector(dir, -600);
        const q = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(pos, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))
        );
        return { position: pos, quaternion: q };
      }
    }

    // 3) Resume from save: use the saved transform, clamped into the system.
    if (fromSave && profPlayer && profPlayer.pos) {
      return {
        position: new THREE.Vector3().fromArray(profPlayer.pos),
        quaternion: new THREE.Quaternion().fromArray(profPlayer.quat)
      };
    }

    return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  }

  _teardown() {
    if (this.world) {
      for (const e of this.world.entities) {
        if (e.mesh) this.scene.remove(e.mesh);
      }
    }
    if (this.dust) { this.scene.remove(this.dust.points); this.dust = null; }
    if (this._laserSegments) { this.scene.remove(this._laserSegments); this._laserSegments = null; }
    if (this.scene) {
      this.scene.background = null;
      this.scene.environment = null;
    }
    this.world = null;
  }

  _beginRunning() {
    this.running = true;
    this.paused = false;
    this.lastT = performance.now();
    requestAnimationFrame(this._loop);
  }

  _resize() {
    const vv = window.visualViewport;
    const w = Math.round(vv?.width  ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
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

    if (Input.pressed('Escape') || Touch.pressed('pause')) {
      if (this.panels.isMapOpen()) this.panels.closeMap();
      else if (this.panels.isGalaxyOpen?.()) this.panels.closeGalaxy();
      else if (this.paused) this.resume();
      else this.pause();
    }
    if ((Input.pressed('KeyM') || Touch.pressed('map')) && !this.paused) {
      if (this.panels.isMapOpen()) this.panels.closeMap();
      else this.panels.openMap(this.world);
    }
    if ((Input.pressed('KeyG') || Touch.pressed('galaxy')) && !this.paused) {
      if (this.panels.isGalaxyOpen?.()) this.panels.closeGalaxy();
      else this.panels.openGalaxy?.(this.galaxy, this.world.systemId, this.visitedSystems);
    }
    if ((Input.pressed('KeyV') || Touch.pressed('cam')) && !this.paused) {
      this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' :
                        this.cameraMode === 'cockpit' ? 'far' : 'chase';
      this.world.log(`Camera: ${this.cameraMode}`, 'good');
    }
    if (Input.pressed('F5')) {
      if (this.saveNow()) this.world.log('Game saved.', 'good');
    }

    if (!this.paused) this._step(dt);

    this.composer.render();
    Input.endFrameInput();
  }

  _step(dt) {
    const world = this.world;
    if (!world) return;
    world.elapsed += dt;

    if (this.playerActions.mode !== 'docked' && world.player.alive) {
      applyPlayerFlight(world.player, dt);
      this.playerActions.update(dt);
    }

    // AI tick.
    for (const e of world.entities) {
      if (e.kind !== 'ship' || e === world.player || !e.alive) continue;
      const top = e.topAction();
      if (top) top.onUpdateActive(e, dt, world);
      const root = e.actions[0];
      if (root && root !== top && root.name === 'Think') {
        root.onUpdateActive(e, dt, world);
      }
    }

    for (const e of world.entities) integrateEntity(e, dt);

    // Spin / animate.
    for (const e of world.entities) {
      if (e.kind === 'station' && e.mesh) {
        e.mesh.rotateY((e.mesh.userData.spinSpeed || 0.1) * dt);
      } else if (e.kind === 'planet' && e.mesh) {
        e.mesh.rotateY(0.02 * dt);
      } else if (e.kind === 'asteroid' && e.mesh) {
        e.mesh.rotateY(0.05 * dt);
      } else if (e.kind === 'gate' && e.mesh) {
        e.mesh.rotateZ(0.4 * dt);
        const m = e.mesh.userData.discMat;
        if (m) m.opacity = 0.25 + Math.sin(world.elapsed * 2.0) * 0.12;
      } else if (e.kind === 'ship' && e.mesh && e.mesh.userData.engineGroup) {
        const v = e.velocity.length();
        const pulse = 0.7 + 0.3 * Math.sin(world.elapsed * 12);
        const intensity = 0.4 + Math.min(1, v / 300) * 1.3 * pulse;
        for (const g of e.mesh.userData.engineGroup.children) {
          g.material.opacity = Math.min(1, 0.6 + intensity * 0.4);
          g.scale.setScalar(0.7 + intensity * 0.6);
        }
      }
    }

    this.weapons.update(dt);

    // Mining laser segments.
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

    // Cull destroyed.
    for (let i = world.entities.length - 1; i >= 0; i--) {
      const e = world.entities[i];
      if (e.alive) continue;
      if (e === world.player) { this._respawnPlayer(); continue; }
      if (e.kind === 'ship' || e.kind === 'asteroid') {
        if (e.mesh) this.scene.remove(e.mesh);
        world.entities.splice(i, 1);
      }
    }

    this._updateCamera(dt);
    this.dust.update(this.camera);

    // Boost FOV easing.
    const targetFov = world.player && world.player.boost > 1.5 ? 86 : 72;
    this._fovLerp += (targetFov - this._fovLerp) * Math.min(1, 4 * dt);

    // Jump-flash FOV bump.
    if (this._jumpFlash > 0) {
      this._fovLerp = THREE.MathUtils.lerp(this._fovLerp, 110, this._jumpFlash);
      this._jumpFlash = Math.max(0, this._jumpFlash - dt * 1.6);
    }
    this.camera.fov = this._fovLerp;
    this.camera.updateProjectionMatrix();

    this.hud.update(dt, this.playerActions.mode);
  }

  _respawnPlayer() {
    const world = this.world;
    world.log('Hull breach! Emergency respawn at station.', 'bad');
    const station = world.station;
    const p = world.player;
    p.alive = true;
    p.hull = p.maxHull * 0.5;
    p.shield = p.maxShield;
    p.energy = p.maxEnergy;
    p.position.copy(station ? station.position : new THREE.Vector3()).add(new THREE.Vector3(400, 0, 0));
    p.velocity.set(0, 0, 0);
    if (p.mesh && !this.scene.children.includes(p.mesh)) this.scene.add(p.mesh);
    p.credits = Math.max(0, (p.credits | 0) - 250);
    this.saveNow();
  }

  _updateCamera(dt) {
    const p = this.world.player;
    if (!p) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion);
    const up  = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion);

    let desired;
    let lookAt = p.position.clone().addScaledVector(fwd, 60);
    if (this.cameraMode === 'cockpit') {
      desired = p.position.clone().addScaledVector(fwd, 4).addScaledVector(up, 4);
    } else if (this.cameraMode === 'far') {
      desired = p.position.clone().addScaledVector(fwd, -60).addScaledVector(up, 24);
    } else {
      desired = p.position.clone().addScaledVector(fwd, -32).addScaledVector(up, 10);
    }
    this.camera.position.lerp(desired, Math.min(1, 8 * dt));
    this.camera.lookAt(lookAt);
    this.camera.up.copy(up);
  }
}
