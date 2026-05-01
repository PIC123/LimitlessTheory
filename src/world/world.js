import * as THREE from 'three';
import { RNG, hashSeed } from '../core/rng.js';
import { Factions } from '../core/factions.js';
import { Items, ItemList, Ores, StationProductions } from '../core/items.js';
import { genSystemName, genStationName, genFieldName, genShipName } from '../core/names.js';
import { buildAsteroidMesh } from '../gen/asteroid.js';
import { buildShipMesh } from '../gen/ship.js';
import { buildStationMesh } from '../gen/station.js';
import { buildPlanetMesh, buildStarMesh } from '../gen/planet.js';
import { buildNebulaSkybox } from '../gen/nebula.js';

// Echoes Limit Theory's kSystemScale = 10000. We use 8000 so distances feel snappy.
export const SYSTEM_SCALE = 8000;

let _eid = 0;

export class Entity {
  constructor(world, kind) {
    this.id = ++_eid;
    this.world = world;
    this.kind = kind;
    this.name = '';
    this.faction = Factions.Coalition.id;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.radius = 1;
    this.alive = true;
    this.mesh = null;            // root Object3D
    this.dragLinear = 0.0;       // ships set this; matches LT setDrag(0.75, 4.0)
    this.dragAngular = 0.0;
    this.maxHull = 100;
    this.hull = 100;
    this.maxShield = 100;
    this.shield = 100;
    this.shieldRegen = 6;
    this.maxEnergy = 100;
    this.energy = 100;
    this.energyRegen = 18;
    this.cargoCap = 0;
    this.cargo = new Map();        // itemId -> qty
    this.credits = 0;
    this.actions = [];             // LT-style action stack (top of stack runs)
    this.target = null;
    this.weapon = { dmg: 6, rate: 0.18, speed: 900, range: 1200, cooldown: 0, energy: 4 };
    this.miner = { dmg: 1.0, rate: 0.25, range: 220, cooldown: 0, energy: 1.5 };
    this.engagementRange = 900;
    this.thrust = 60;
    this.boost = 1;
    this.lastShotAt = 0;
    this.metadata = {};
  }

  cargoUsed() {
    let n = 0; for (const q of this.cargo.values()) n += q;
    return n;
  }
  cargoAdd(itemId, qty) {
    const free = this.cargoCap - this.cargoUsed();
    const take = Math.min(free, qty);
    if (take <= 0) return 0;
    this.cargo.set(itemId, (this.cargo.get(itemId) || 0) + take);
    return take;
  }
  cargoRemove(itemId, qty) {
    const have = this.cargo.get(itemId) || 0;
    const take = Math.min(have, qty);
    if (take <= 0) return 0;
    if (take === have) this.cargo.delete(itemId);
    else this.cargo.set(itemId, have - take);
    return take;
  }

  pushAction(a) { this.actions.push(a); }
  popAction()   { this.actions.pop(); }
  isIdle()      { return this.actions.length === 0; }
  topAction()   { return this.actions[this.actions.length - 1] || null; }

  applyDamage(dmg, attacker) {
    if (!this.alive) return;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    if (dmg > 0) this.hull -= dmg;
    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
      this.world.onDestroy(this, attacker);
    }
  }
}

export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.entities = [];
    this.player = null;
    this.seed = opts.seed ?? hashSeed(null);
    this.rng = new RNG(this.seed);
    this.systemName = '';
    this.zones = [];          // descriptive zones (asteroid fields, etc.)
    this.station = null;      // primary station (for now we keep one, can grow)
    this.planet = null;
    this.star = null;
    this.skybox = null;
    this.starDir = new THREE.Vector3(1, 0.2, 0.6).normalize();
    this.elapsed = 0;
    this.events = [];         // toast log queue
  }

  log(text, level = 'info') {
    this.events.push({ text, level, time: this.elapsed });
  }

  onDestroy(entity, attacker) {
    if (entity.kind === 'ship' || entity.kind === 'asteroid') {
      this.log(`${entity.name || entity.kind} destroyed`, entity === this.player ? 'bad' : 'warn');
      // Drop cargo as little floating ore — keep it simple by giving credits to the killer.
      if (attacker && attacker !== entity) {
        if (entity.kind === 'ship' && entity.faction === Factions.Pirates.id) {
          attacker.credits = (attacker.credits || 0) + 250 + Math.floor(this.rng.getUniform() * 350);
          if (attacker === this.player) this.log(`+ ${attacker.credits | 0} cr bounty`, 'good');
        }
      }
    }
  }

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

  ofKind(kind) {
    return this.entities.filter(e => e.kind === kind && e.alive);
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

  // ---------- Generation (mirrors LT's System:spawnXxx) ----------
  generate() {
    const rng = this.rng;
    this.systemName = genSystemName(rng);

    // Skybox / nebula.
    this.skybox = buildNebulaSkybox(rng, this.starDir);
    this.scene.background = this.skybox;
    this.scene.environment = this.skybox;

    // Star (just visual; the nebula already bakes the star).
    this.star = new Entity(this, 'star');
    this.star.name = `${this.systemName} A`;
    this.star.faction = Factions.Coalition.id;
    this.star.mesh = buildStarMesh(rng);
    this.star.mesh.position.copy(this.starDir).multiplyScalar(SYSTEM_SCALE * 6);
    this.star.position.copy(this.star.mesh.position);
    this.star.radius = 600;
    this.add(this.star);

    // Planet (LT spawns 0..N; we always include one for orientation).
    {
      const planet = new Entity(this, 'planet');
      planet.name = genSystemName(rng) + ' II';
      planet.mesh = buildPlanetMesh(rng);
      const dir = rng.getDir3();
      dir.y *= 0.15;
      planet.mesh.position.copy(dir.normalize()).multiplyScalar(SYSTEM_SCALE * (1.4 + rng.getUniform() * 1.6));
      planet.position.copy(planet.mesh.position);
      planet.radius = 1200;
      planet.faction = Factions.Coalition.id;
      this.planet = planet;
      this.add(planet);
    }

    // Stations (1..3). One is always Coalition (friendly to player).
    const stationCount = 1 + rng.getInt(0, 2);
    let firstStation = null;
    for (let i = 0; i < stationCount; i++) {
      const station = new Entity(this, 'station');
      const prod = rng.choose(StationProductions);
      station.name = `${genStationName(rng)} (${prod.name})`;
      station.faction = i === 0 ? Factions.Coalition.id : (rng.getUniform() < 0.6 ? Factions.Traders.id : Factions.Coalition.id);
      const ringR = SYSTEM_SCALE * 0.55;
      const ang = rng.getUniform() * Math.PI * 2;
      station.mesh = buildStationMesh(rng);
      station.mesh.position.set(Math.cos(ang) * ringR, (rng.getUniform() - 0.5) * 200, Math.sin(ang) * ringR);
      station.position.copy(station.mesh.position);
      station.radius = 220;
      station.metadata.production = prod;
      station.metadata.market = this._buildMarket(prod);
      this.add(station);
      if (!firstStation) { firstStation = station; this.station = station; }
    }

    // Asteroid fields. LT spawns one with ~500 asteroids; we'll do a couple of smaller fields.
    const fieldCount = 2 + rng.getInt(0, 2);
    for (let f = 0; f < fieldCount; f++) {
      const zone = { name: genFieldName(rng), pos: new THREE.Vector3(), entities: [] };
      const angle = rng.getUniform() * Math.PI * 2;
      const r = SYSTEM_SCALE * (0.25 + rng.getUniform() * 0.7);
      zone.pos.set(Math.cos(angle) * r, (rng.getUniform() - 0.5) * 400, Math.sin(angle) * r);
      const count = 60 + rng.getInt(0, 60);
      const oreCount = 10 + rng.getInt(0, 12);
      for (let i = 0; i < count; i++) {
        const a = new Entity(this, 'asteroid');
        a.name = `${zone.name} #${i+1}`;
        a.faction = Factions.Coalition.id;
        const offset = rng.getSphere().multiplyScalar(700 + rng.getExp() * 1400);
        a.position.copy(zone.pos).add(offset);
        const scale = 12 + Math.pow(rng.getExp(), 2) * 70;
        a.radius = scale;
        a.maxHull = 40 + scale * 1.5; a.hull = a.maxHull;
        a.maxShield = 0; a.shield = 0;
        a.mesh = buildAsteroidMesh(rng, scale);
        a.mesh.position.copy(a.position);
        a.mesh.quaternion.copy(rng.getQuat());
        // Ore yield: a fraction of asteroids carry ore (LT uses last oreCount of the field).
        if (i >= count - oreCount) {
          a.metadata.ore = rng.choose(Ores).id;
          a.metadata.oreAmount = 12 + rng.getInt(0, 18);
        }
        zone.entities.push(a);
        this.add(a);
      }
      this.zones.push(zone);
    }

    // AI ships: a few patrols + a few pirates roaming the asteroid fields.
    for (let i = 0; i < 6; i++) {
      const ship = this._spawnAIShip(Factions.Coalition.id);
      ship.name = `Coalition Patrol ${i+1}`;
    }
    for (let i = 0; i < 6; i++) {
      const ship = this._spawnAIShip(Factions.Pirates.id);
      ship.name = `Reaver ${genShipName(rng).split(' ')[1]}`;
      ship.metadata.preferAttack = true;
    }
    for (let i = 0; i < 3; i++) {
      const ship = this._spawnAIShip(Factions.Traders.id);
      ship.name = `Trader ${i+1}`;
    }

    // Player ship (centered).
    const player = new Entity(this, 'ship');
    player.name = 'YOUR SHIP';
    player.faction = Factions.Player.id;
    player.position.set(0, 0, 0);
    player.maxHull = 150; player.hull = 150;
    player.maxShield = 120; player.shield = 120;
    player.maxEnergy = 140; player.energy = 140;
    player.dragLinear = 0.75; player.dragAngular = 4.0;
    player.cargoCap = 60;
    player.credits = 2500;
    player.thrust = 90;
    player.weapon = { dmg: 9, rate: 0.14, speed: 1200, range: 1600, cooldown: 0, energy: 3 };
    player.miner = { dmg: 1.4, rate: 0.18, range: 280, cooldown: 0, energy: 1.5 };
    player.mesh = buildShipMesh(rng, { role: 'player', size: 8 });
    player.radius = 9;
    this.add(player);
    this.player = player;
  }

  _spawnAIShip(factionId) {
    const ship = new Entity(this, 'ship');
    ship.faction = factionId;
    ship.position.copy(this.rng.getDir3()).multiplyScalar(SYSTEM_SCALE * (0.3 + this.rng.getUniform() * 0.6));
    ship.position.y *= 0.2;
    ship.dragLinear = 0.75; ship.dragAngular = 4.0;
    ship.thrust = 50 + this.rng.getUniform() * 30;
    ship.maxHull = 60; ship.hull = 60;
    ship.maxShield = 60; ship.shield = 60;
    ship.cargoCap = 30;
    const colors = {
      Coalition: 0x00e7ff,
      Pirates:   0xff476a,
      Traders:   0xffd23d
    };
    const role = factionId === 'Pirates' ? 'fighter' : (factionId === 'Traders' ? 'trader' : 'patrol');
    ship.mesh = buildShipMesh(this.rng, { role, size: 5 + this.rng.getUniform() * 3, accent: colors[factionId] || 0xffffff });
    ship.radius = 6;
    ship.weapon = { dmg: 5, rate: 0.25, speed: 900, range: 1200, cooldown: 0, energy: 3 };
    this.add(ship);
    return ship;
  }

  // Initialize per-station market with prices that bias toward consumption/production.
  _buildMarket(prod) {
    const market = {};
    for (const item of ItemList) {
      const isCons = prod.consumes.includes(item.id);
      const isProd = prod.produces.includes(item.id);
      const stock = isProd ? 80 + Math.floor(this.rng.getUniform() * 80) :
                    isCons ? 20 + Math.floor(this.rng.getUniform() * 30) :
                    40 + Math.floor(this.rng.getUniform() * 40);
      const buyMult  = isCons ? 1.25 + this.rng.getUniform() * 0.15 : 0.85 + this.rng.getUniform() * 0.10;
      const sellMult = isProd ? 0.75 + this.rng.getUniform() * 0.10 : 1.10 + this.rng.getUniform() * 0.20;
      market[item.id] = {
        item,
        stock,
        // Station BUYS at this price, station SELLS at this price.
        // (From the player's POV, you sell at "buyPrice" and buy at "sellPrice".)
        buyPrice:  Math.round(item.base * buyMult),
        sellPrice: Math.round(item.base * sellMult),
        consumes: isCons,
        produces: isProd
      };
    }
    return market;
  }
}
