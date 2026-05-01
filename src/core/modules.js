// Modular ship sockets. Mirrors Limit Theory's Socket / SocketType / Turret / Thruster
// model: ships expose typed sockets that accept "plug" modules. We collapse the model
// to one slot per type for clarity (weapon, miner, engine, shield, armor, cargo).
//
// applyLoadout() rebuilds derived ship stats from base + currently-equipped modules.
// All ship stats that are loadout-driven live here; the rest of the codebase reads
// the resulting fields off the entity (player.weapon, player.thrust, player.maxShield, ...).

export const SLOTS = ['weapon', 'miner', 'engine', 'shield', 'armor', 'cargo'];

export const SLOT_LABEL = {
  weapon: 'Primary Weapon',
  miner:  'Mining Tool',
  engine: 'Drive',
  shield: 'Shield Generator',
  armor:  'Hull Plating',
  cargo:  'Cargo Hold'
};

const def = (id, slot, label, tier, price, stats, desc) => ({ id, slot, label, tier, price, stats, desc });

export const Modules = {
  // -------- Weapons --------
  'pulse-1':   def('pulse-1',   'weapon', 'Pulse Cannon Mk1',  1,    0, { dmg: 9,  range: 1600, rate: 0.14, speed: 1200, energy: 3 }, 'Reliable starter cannon. Balanced fire rate and damage.'),
  'pulse-2':   def('pulse-2',   'weapon', 'Pulse Cannon Mk2',  2, 1800, { dmg: 14, range: 1850, rate: 0.13, speed: 1300, energy: 4 }, 'Refined coil geometry; stronger bolts.'),
  'rapid-2':   def('rapid-2',   'weapon', 'Rapidfire Mk2',     2, 1900, { dmg: 5,  range: 1300, rate: 0.07, speed: 1400, energy: 1.6 }, 'Light, very fast bolts. Brutal up-close.'),
  'pulse-3':   def('pulse-3',   'weapon', 'Hellbore Cannon',   3, 5400, { dmg: 24, range: 2200, rate: 0.16, speed: 1500, energy: 6 }, 'Anti-capital armament. Slow but devastating.'),
  'plasma-3':  def('plasma-3',  'weapon', 'Plasma Lance',      3, 6200, { dmg: 32, range: 2400, rate: 0.22, speed: 1700, energy: 9 }, 'Long-range surgical plasma. Hold to lance.'),

  // -------- Mining --------
  'miner-1':   def('miner-1',   'miner',  'Mining Laser Mk1',  1,    0, { dmg: 1.4, rate: 0.18, range: 280, energy: 1.5 }, 'Light beam suitable for surface ore.'),
  'miner-2':   def('miner-2',   'miner',  'Mining Laser Mk2',  2, 1400, { dmg: 2.4, rate: 0.14, range: 380, energy: 2.0 }, 'Higher cycle rate; sustains beam longer.'),
  'miner-3':   def('miner-3',   'miner',  'Beam Cutter Mk3',   3, 4200, { dmg: 4.0, rate: 0.10, range: 520, energy: 3.0 }, 'Industrial cutter; eats asteroids quickly.'),

  // -------- Engines --------
  'engine-1':  def('engine-1',  'engine', 'Standard Drive',    1,    0, { thrust: 90,  boostMult: 2.4 }, 'Stock fusion thruster.'),
  'engine-2':  def('engine-2',  'engine', 'Burst Thruster',    2, 1500, { thrust: 130, boostMult: 2.8 }, 'Tuned for sprints and tight turns.'),
  'engine-3':  def('engine-3',  'engine', 'Singularity Drive', 3, 4800, { thrust: 175, boostMult: 3.6 }, 'Capital-tier propulsion in a fighter frame.'),

  // -------- Shields --------
  'shield-1':  def('shield-1',  'shield', 'Deflector Mk1',     1,    0, { maxShield: 120, regen: 6 }, 'Standard shield array.'),
  'shield-2':  def('shield-2',  'shield', 'Deflector Mk2',     2, 1700, { maxShield: 200, regen: 10 }, 'Faster regen, larger envelope.'),
  'shield-3':  def('shield-3',  'shield', 'Aegis Shield',      3, 5200, { maxShield: 320, regen: 16 }, 'Capital-class shield generator.'),

  // -------- Armor --------
  'armor-1':   def('armor-1',   'armor',  'Hull Plating Mk1',  1,    0, { maxHull: 150 }, 'Stock duranium plating.'),
  'armor-2':   def('armor-2',   'armor',  'Reinforced Hull',   2, 1600, { maxHull: 240 }, 'Layered titanium with shock-absorbing strata.'),
  'armor-3':   def('armor-3',   'armor',  'Neutronium Lattice',3, 5000, { maxHull: 380 }, 'Near-impossible to fabricate. Near-impossible to crack.'),

  // -------- Cargo --------
  'cargo-1':   def('cargo-1',   'cargo',  'Standard Hold',     1,    0, { cargoCap: 60 }, 'Default hold.'),
  'cargo-2':   def('cargo-2',   'cargo',  'Expanded Hold',     2, 1200, { cargoCap: 120 }, 'Reorganized internals; nearly double the volume.'),
  'cargo-3':   def('cargo-3',   'cargo',  'Bulk Hold',         3, 3800, { cargoCap: 240 }, 'Trader-grade cargo bay. Sacrifices some agility.'),
};

export function moduleById(id) { return Modules[id]; }
export function modulesBySlot(slot) {
  return Object.values(Modules).filter(m => m.slot === slot);
}

export function defaultLoadout() {
  return {
    weapon: 'pulse-1',
    miner:  'miner-1',
    engine: 'engine-1',
    shield: 'shield-1',
    armor:  'armor-1',
    cargo:  'cargo-1'
  };
}

// Apply a loadout to a player ship entity. Preserves current hull/shield/energy as
// a percentage so swapping a shield mid-fight doesn't fully heal you.
export function applyLoadout(player, loadout) {
  player.metadata.loadout = { ...loadout };

  const w = Modules[loadout.weapon]?.stats || {};
  player.weapon = {
    dmg: w.dmg ?? 9, range: w.range ?? 1600, rate: w.rate ?? 0.14,
    speed: w.speed ?? 1200, energy: w.energy ?? 3, cooldown: 0
  };

  const mn = Modules[loadout.miner]?.stats || {};
  player.miner = {
    dmg: mn.dmg ?? 1.4, rate: mn.rate ?? 0.18,
    range: mn.range ?? 280, energy: mn.energy ?? 1.5, cooldown: 0
  };

  const en = Modules[loadout.engine]?.stats || {};
  player.thrust = en.thrust ?? 90;
  player.metadata.boostMult = en.boostMult ?? 2.4;

  const shieldPct = player.maxShield > 0 ? player.shield / player.maxShield : 1;
  const sh = Modules[loadout.shield]?.stats || {};
  player.maxShield = sh.maxShield ?? 120;
  player.shieldRegen = sh.regen ?? 6;
  player.shield = Math.min(player.maxShield, player.maxShield * shieldPct);

  const hullPct = player.maxHull > 0 ? player.hull / player.maxHull : 1;
  const ar = Modules[loadout.armor]?.stats || {};
  player.maxHull = ar.maxHull ?? 150;
  player.hull = Math.max(1, Math.min(player.maxHull, player.maxHull * hullPct));

  const cg = Modules[loadout.cargo]?.stats || {};
  player.cargoCap = cg.cargoCap ?? 60;
}
