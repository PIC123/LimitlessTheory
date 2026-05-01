// Factions and disposition. Mirrors LT's Player owner concept — every entity has an owner
// and dispositions between owners drive Attack vs. Escort behavior.

export const Factions = {
  Player:    { id: 'Player',   name: 'Independent',     color: 0x00e7ff },
  Coalition: { id: 'Coalition',name: 'Stellar Coalition', color: 0x6dffa0 },
  Pirates:   { id: 'Pirates',  name: 'Crimson Reavers', color: 0xff476a },
  Traders:   { id: 'Traders',  name: 'Merchant Guild',  color: 0xffd23d }
};

// Disposition matrix: -1 hostile, 0 neutral, +1 ally.
const D = {
  Player:    { Player: 1,  Coalition: 1,  Pirates: -1, Traders: 0 },
  Coalition: { Player: 1,  Coalition: 1,  Pirates: -1, Traders: 0 },
  Pirates:   { Player: -1, Coalition: -1, Pirates: 1,  Traders: -1 },
  Traders:   { Player: 0,  Coalition: 0,  Pirates: -1, Traders: 1 }
};

export function disposition(a, b) {
  if (!a || !b) return 0;
  return D[a]?.[b] ?? 0;
}

export function isHostile(a, b) { return disposition(a, b) < 0; }
export function isAlly(a, b) { return disposition(a, b) > 0; }
