// Persistent save/load via localStorage. Single slot, schema-versioned.
// We deliberately persist only player progression + galaxy seed + visited-system
// list; per-system asteroid state intentionally regenerates each visit.

const KEY = 'limitless-theory.save';
const VERSION = 1;

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || obj.version !== VERSION) return null;
    return obj;
  } catch { return null; }
}

export function saveProfile(profile) {
  try {
    const obj = { ...profile, version: VERSION, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(obj));
    return true;
  } catch { return false; }
}

export function deleteSave() {
  try { localStorage.removeItem(KEY); } catch {}
}

// Snapshot live game state into a serializable profile.
export function snapshot(galaxy, world, player, mode = 'flight') {
  const cargo = {};
  for (const [k, v] of player.cargo.entries()) cargo[k] = v;
  return {
    galaxySeed: galaxy.seed,
    currentSystemId: world.systemId,
    visitedSystems: galaxy._visitedHack ? [...galaxy._visitedHack] : [],
    player: {
      pos: [player.position.x, player.position.y, player.position.z],
      quat: [player.quaternion.x, player.quaternion.y, player.quaternion.z, player.quaternion.w],
      vel: [player.velocity.x, player.velocity.y, player.velocity.z],
      hull: player.hull,
      shield: player.shield,
      energy: player.energy,
      credits: player.credits | 0,
      cargo,
      loadout: { ...(player.metadata.loadout || {}) },
      hangar: [...(player.metadata.hangar || [])]
    },
    mode
  };
}
