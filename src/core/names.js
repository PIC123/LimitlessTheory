// Faithful port of Limit Theory's Distribution-based name generator
// (System.lua: cons + vowels distributions, alternating syllables).
// We add a small set of suffixes for variety.

const consonants = [
  ['b', 1.5], ['c', 2.8], ['d', 4.3], ['f', 2.2], ['g', 2.0], ['h', 6.1],
  ['j', 0.2], ['k', 0.8], ['l', 4.0], ['m', 2.4], ['n', 6.7], ['p', 1.9],
  ['q', 0.1], ['r', 6.0], ['s', 6.3], ['t', 9.1], ['v', 1.0], ['w', 2.4],
  ['x', 0.2], ['z', 0.1],
  ['ll', 0.4], ['ss', 0.6], ['tt', 0.9], ['ff', 0.2], ['rr', 0.6],
  ['nn', 0.6], ['pp', 0.2], ['cc', 0.3]
];

const vowels = [
  ['a', 8.2], ['e', 12.7], ['i', 7.0], ['o', 7.5], ['u', 2.8], ['y', 2.0],
  ['ee', 1.2], ['oo', 0.7]
];

const stationSuffix = ['Hub', 'Anchorage', 'Outpost', 'Forge', 'Yard', 'Refinery', 'Bastion', 'Spire', 'Junction'];
const fieldSuffix = ['Field', 'Belt', 'Reach', 'Sprawl', 'Drift', 'Cluster'];

function sample(rng, dist) {
  let total = 0;
  for (const [, w] of dist) total += w;
  let r = rng.getUniform() * total;
  for (const [v, w] of dist) {
    r -= w;
    if (r <= 0) return v;
  }
  return dist[0][0];
}

export function genWord(rng) {
  const syllables = rng.getInt(2, 4);
  let s = '';
  for (let i = 0; i < syllables; i++) {
    s += sample(rng, consonants);
    s += sample(rng, vowels);
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function genSystemName(rng) {
  const w = genWord(rng);
  const designations = ['', '', '-' + rng.getInt(1, 999), ' ' + String.fromCharCode(65 + rng.getInt(0, 25))];
  return w + rng.choose(designations);
}

export function genStationName(rng) {
  return `${genWord(rng)} ${rng.choose(stationSuffix)}`;
}

export function genFieldName(rng) {
  return `${genWord(rng)} ${rng.choose(fieldSuffix)}`;
}

export function genShipName(rng) {
  const prefixes = ['ISS', 'SCV', 'TGS', 'KRX', 'NSV', 'AEX'];
  return `${rng.choose(prefixes)} ${genWord(rng)}`;
}
