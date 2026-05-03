import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { buildShipMesh } from '../gen/ship.js';
import { applyLoadout, defaultLoadout } from '../core/modules.js';
import { Factions } from '../core/factions.js';
import { buildTerrainMesh, buildSkyDome, sampleHeight, TERRAIN_SIZE } from '../gen/terrain.js';
import { buildRuinsMesh, buildOutpostMesh } from '../gen/poi.js';
import { genStationName } from '../core/names.js';

// PlanetSurface mirrors the shape of `World` enough that Game can swap them
// in and out interchangeably:
//   - .entities[]
//   - .player
//   - .systemName (the planet's name, used for HUD)
//   - .events[] toast log
//   - .log()
//   - .reputation (passes through from save)
// It does NOT carry NPC ships, asteroids, weapons, factions etc. — surface
// flight is intentionally calmer.

export class PlanetSurface {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.entities = [];
    this.player = null;
    this.events = [];
    this.elapsed = 0;
    this.kind = 'surface';
    this.systemName = opts.planetName || 'Surface';
    this.biome = opts.biome || 'desert';
    this.seed = opts.seed >>> 0;
    this.rng = new RNG(this.seed);
    this.reputation = opts.reputation || { Coalition: 0, Pirates: 0, Traders: 0 };

    // Surface gameplay flags.
    this.gates = [];
    this.stations = [];
    this.zones = [];
    this.station = null;
    this.terrain = null;
    this.sky = null;
    this.pois = [];               // Entities of kind 'poi'

    // Origin of planet surface scene — terrain is centered at (0,0,0).
    // Player flies above terrain in the local Y axis.
  }

  log(text, level = 'info') {
    this.events.push({ text, level, time: this.elapsed });
  }

  onDestroy() { /* surface is non-combat */ }

  add(entity) {
    this.entities.push(entity);
    if (entity.mesh) this.scene.add(entity.mesh);
    return entity;
  }
  remove(entity) {
    const i = this.entities.indexOf(entity);
    if (i >= 0) this.entities.splice(i, 1);
    if (entity.mesh) this.scene.remove(entity.mesh);
  }

  closest(from, predicate, maxDist = Infinity) {
    let best = null, bestD = maxDist * maxDist;
    for (const e of this.entities) {
      if (!e.alive || e === from) continue;
      if (predicate && !predicate(e)) continue;
      const d = e.position.distanceToSquared(from.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
  ofKind(kind) { return this.entities.filter(e => e.kind === kind && e.alive); }

  // ---------- Generation ----------
  generate() {
    const rng = this.rng;

    // Sky + sunlight.
    this.sky = buildSkyDome(this.biome);
    this.scene.add(this.sky);
    this.scene.background = null;
    this.scene.environment = null;
    // Surface uses a much denser, warmer atmospheric haze. Fades distant
    // terrain into the horizon color so the planet feels enclosed.
    this.scene.fog = new THREE.FogExp2(0x6f4e2d, 0.00065);

    // Single directional sun, warm but not eye-searing. Threshold-gated bloom
    // (see render/postfx) means the sunlit terrain itself doesn't bloom — only
    // the sky's sun disk and the POI beacons do.
    const sun = new THREE.DirectionalLight(0xffe5b8, 1.15);
    sun.position.set(60, 50, 30);
    this.scene.add(sun);
    this._sun = sun;

    // Soft fill from horizon color (gives shadow side of terrain a hint of warmth).
    const fill = new THREE.HemisphereLight(0xffd6a0, 0x2a1c10, 0.32);
    this.scene.add(fill);
    this._fill = fill;

    // Terrain.
    this.terrain = buildTerrainMesh(rng, this.biome);
    this.scene.add(this.terrain);

    // POIs scattered across the patch. Each becomes a queryable entity so
    // the player-actions / HUD can reach them through the same interface.
    const poiCount = 2 + rng.getInt(0, 3);
    const placed = [];
    let attempts = 0;
    while (this.pois.length < poiCount && attempts++ < 60) {
      const x = (rng.getUniform() - 0.5) * (TERRAIN_SIZE * 0.7);
      const z = (rng.getUniform() - 0.5) * (TERRAIN_SIZE * 0.7);
      // Reject if too close to a previously placed POI.
      if (placed.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 200 * 200)) continue;
      placed.push({ x, z });

      const isOutpost = rng.getUniform() < 0.45 && this.pois.length === 0;
      const mesh = isOutpost ? buildOutpostMesh(rng) : buildRuinsMesh(rng);
      const y = sampleHeight(this.terrain, x, z);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rng.getUniform() * Math.PI * 2;
      this.scene.add(mesh);

      const poi = {
        id: this.entities.length + 1,
        kind: 'poi',
        alive: true,
        name: isOutpost ? `${genStationName(rng)} Outpost`
                        : `${genStationName(rng)} Ruins`,
        faction: Factions.Coalition.id,
        position: mesh.position.clone(),
        velocity: new THREE.Vector3(),
        quaternion: mesh.quaternion.clone(),
        radius: mesh.userData.radius || 25,
        mesh,
        cargo: new Map(),
        actions: [],
        target: null,
        metadata: {
          poiKind: mesh.userData.kind,
          looted: false,
          rewardCredits: isOutpost ? 400 + rng.getInt(0, 300) : 600 + rng.getInt(0, 700)
        },
        applyDamage() {}, cargoUsed() { return 0; },
        cargoAdd() { return 0; }, cargoRemove() { return 0; },
        pushAction() {}, popAction() {}, isIdle() { return true; }, topAction() { return null; }
      };
      this.entities.push(poi);
      this.pois.push(poi);
    }
  }

  // Drop the player onto the surface at a sane altitude.
  spawnPlayer(opts = {}) {
    const player = {
      id: -1,
      kind: 'ship',
      alive: true,
      name: 'YOUR SHIP',
      faction: Factions.Player.id,
      position: new THREE.Vector3(0, 200, TERRAIN_SIZE * 0.3),
      velocity: new THREE.Vector3(0, 0, 0),
      angularVelocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      radius: 9,
      maxHull: 150, hull: opts.hull ?? 150,
      maxShield: 120, shield: opts.shield ?? 120,
      shieldRegen: 6,
      maxEnergy: 140, energy: opts.energy ?? 140,
      energyRegen: 18,
      cargoCap: 60,
      cargo: new Map(),
      credits: opts.credits ?? 0,
      actions: [],
      target: null,
      weapon: { dmg: 9, range: 1600, rate: 0.14, speed: 1200, energy: 3, cooldown: 0 },
      miner: { dmg: 1.4, rate: 0.18, range: 280, energy: 1.5, cooldown: 0 },
      thrust: 90,
      boost: 1,
      dragLinear: 0.6, dragAngular: 4.0,
      lastShotAt: 0,
      metadata: {},
      mesh: buildShipMesh(this.rng, { role: 'player', size: 8 }),
      // Entity-protocol stubs.
      cargoUsed() { let n = 0; for (const q of this.cargo.values()) n += q; return n; },
      cargoAdd(id, qty) {
        const free = this.cargoCap - this.cargoUsed();
        const take = Math.min(free, qty);
        if (take <= 0) return 0;
        this.cargo.set(id, (this.cargo.get(id) || 0) + take);
        return take;
      },
      cargoRemove(id, qty) {
        const have = this.cargo.get(id) || 0;
        const take = Math.min(have, qty);
        if (take <= 0) return 0;
        if (take === have) this.cargo.delete(id); else this.cargo.set(id, have - take);
        return take;
      },
      pushAction(a) { this.actions.push(a); },
      popAction() { this.actions.pop(); },
      isIdle() { return this.actions.length === 0; },
      topAction() { return this.actions[this.actions.length - 1] || null; },
      applyDamage(d) { /* surface is non-combat */ }
    };
    applyLoadout(player, opts.loadout ?? defaultLoadout());
    player.hull = opts.hull ?? player.maxHull;
    player.shield = opts.shield ?? player.maxShield;
    if (opts.cargo) for (const [k, v] of Object.entries(opts.cargo)) player.cargo.set(k, v);
    if (opts.hangar) player.metadata.hangar = [...opts.hangar];
    else player.metadata.hangar = [];

    // Position above terrain at spawn.
    const groundY = sampleHeight(this.terrain, player.position.x, player.position.z);
    player.position.y = groundY + 220;

    this.scene.add(player.mesh);
    this.entities.push(player);
    this.player = player;
    return player;
  }

  // Apply gentle surface gravity + ground collision. Called from Game._step.
  surfaceUpdate(dt) {
    if (!this.player || !this.player.alive) return;
    const p = this.player;
    // Gravity ~10 m/s^2 in the local frame.
    p.velocity.y -= 18 * dt;
    // Collide against terrain. Min altitude = 6m above heightmap.
    const groundY = sampleHeight(this.terrain, p.position.x, p.position.z);
    const minY = groundY + 8;
    if (p.position.y < minY) {
      p.position.y = minY;
      // Bounce off and lose a bit of vertical speed.
      if (p.velocity.y < 0) p.velocity.y *= -0.15;
      // Friction when scraping ground.
      p.velocity.x *= Math.exp(-3 * dt);
      p.velocity.z *= Math.exp(-3 * dt);
    }
    // Soft cap on altitude — beyond 1500m above ground we're "leaving the
    // atmosphere" (Game uses this to trigger a takeoff prompt).
    p.metadata.altitude = p.position.y - groundY;
  }

  // No NPC ships on the surface yet; satisfy the World protocol.
  findNearestHostile() { return null; }

  // Tear-down: dispose of meshes and lights.
  teardown() {
    if (this.terrain) this.scene.remove(this.terrain);
    if (this.sky) this.scene.remove(this.sky);
    if (this._sun) this.scene.remove(this._sun);
    if (this._fill) this.scene.remove(this._fill);
    for (const e of this.entities) if (e.mesh) this.scene.remove(e.mesh);
    this.entities.length = 0;
  }
}
