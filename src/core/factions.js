// Factions, base disposition matrix, and reputation.
// Mirrors LT's Player owner concept — every entity has an owner. Player rep
// with each faction layers on top of the base matrix and can flip neutrals
// hostile (or hostiles friendly) when crossed thresholds.

export const Factions = {
  Player:    { id: 'Player',   name: 'Independent',     color: 0x00e7ff },
  Coalition: { id: 'Coalition',name: 'Stellar Coalition', color: 0x6dffa0 },
  Pirates:   { id: 'Pirates',  name: 'Crimson Reavers', color: 0xff476a },
  Traders:   { id: 'Traders',  name: 'Merchant Guild',  color: 0xffd23d }
};

// Base disposition matrix: -1 hostile, 0 neutral, +1 ally.
const D = {
  Player:    { Player: 1,  Coalition: 1,  Pirates: -1, Traders: 0 },
  Coalition: { Player: 1,  Coalition: 1,  Pirates: -1, Traders: 0 },
  Pirates:   { Player: -1, Coalition: -1, Pirates: 1,  Traders: -1 },
  Traders:   { Player: 0,  Coalition: 0,  Pirates: -1, Traders: 1 }
};

export function baseDisposition(a, b) {
  if (!a || !b) return 0;
  return D[a]?.[b] ?? 0;
}

// Reputation thresholds — within ±100, the rep crosses these to flip relations.
export const REP_HOSTILE = -50;
export const REP_ALLY    =  50;
export const REP_MIN = -100;
export const REP_MAX =  100;

export function defaultReputation() {
  // Pirates start hostile because of the base disposition; rep starts at 0
  // because faction members will already shoot you on sight regardless.
  return { Coalition: 0, Pirates: 0, Traders: 0 };
}

// Effective disposition between two factions, taking player rep into account.
// world is optional; if omitted we fall back to base disposition.
export function disposition(world, a, b) {
  const base = baseDisposition(a, b);
  const rep = world?.reputation;
  if (!rep) return base;
  // If one side is the player, layer their reputation with the other faction.
  if (a === 'Player') {
    const r = rep[b] ?? 0;
    if (r <= REP_HOSTILE) return -1;
    if (r >= REP_ALLY)    return 1;
  }
  if (b === 'Player') {
    const r = rep[a] ?? 0;
    if (r <= REP_HOSTILE) return -1;
    if (r >= REP_ALLY)    return 1;
  }
  return base;
}

export function isHostile(world, a, b) { return disposition(world, a, b) < 0; }
export function isAlly(world, a, b)    { return disposition(world, a, b) > 0; }

// Mutate the player's reputation with `factionId` and clamp.
export function adjustRep(world, factionId, delta) {
  if (!world.reputation) world.reputation = defaultReputation();
  const cur = world.reputation[factionId] ?? 0;
  const next = Math.max(REP_MIN, Math.min(REP_MAX, cur + delta));
  world.reputation[factionId] = next;
  return next - cur;
}

export function relLabel(rep) {
  if (rep >= 75) return 'EXEMPLAR';
  if (rep >= REP_ALLY) return 'ALLY';
  if (rep >= 20) return 'FRIENDLY';
  if (rep > -20) return 'NEUTRAL';
  if (rep > REP_HOSTILE) return 'WARY';
  if (rep > -75) return 'HOSTILE';
  return 'NEMESIS';
}

export function repColor(rep) {
  if (rep >= REP_ALLY) return '#6dffa0';
  if (rep > -20) return '#cfeaff';
  if (rep > REP_HOSTILE) return '#ffd23d';
  return '#ff476a';
}
