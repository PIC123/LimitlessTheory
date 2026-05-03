import { Game } from './game.js';
import { Panels } from './ui/panels.js';
import { loadProfile, hasSave, deleteSave } from './core/save.js';
import * as Touch from './systems/touchControls.js';
import { bindButtons as bindFullscreen } from './systems/fullscreen.js';
import * as Audio from './systems/audio.js';

const canvas = document.getElementById('view');
let game = null;

// Initialize touch overlay (no-op on desktop). Force=true with ?touch=1 for QA.
Touch.init({ force: new URLSearchParams(location.search).has('touch') });
Touch.setVisible(false); // hidden until we enter a game
// On phones, give the canvas the entire viewport including under the address bar.
if (Touch.isEnabled()) document.body.classList.add('mobile');

// Fullscreen button: bound on both the HUD-corner button and the touch top bar.
bindFullscreen(
  document.getElementById('btn-fullscreen'),
  document.getElementById('touch-fullscreen')
);
document.getElementById('btn-quicksave')?.addEventListener('click', () => {
  if (game?.saveNow()) game.world?.log('Game saved.', 'good');
});

// Audio bootstrap. Browsers require a user gesture; we lazily init on the
// first NEW GAME / CONTINUE click. Volume sliders live in the pause menu.
function bootAudioFromGesture() {
  Audio.init();
  Audio.resume();
  // Restore persisted volumes from save (if any).
  const saved = hasSave() ? loadProfile() : null;
  if (saved?.audio) {
    Audio.setVolumes(saved.audio);
    if (saved.audio.muted != null) Audio.setMuted(saved.audio.muted);
  }
  syncVolumeUI();
}

function syncVolumeUI() {
  const v = Audio.getVolumes();
  const m = document.getElementById('vol-master');
  const mu = document.getElementById('vol-music');
  const sx = document.getElementById('vol-sfx');
  const mb = document.getElementById('btn-mute');
  if (m) m.value = Math.round(v.master * 100);
  if (mu) mu.value = Math.round(v.music * 100);
  if (sx) sx.value = Math.round(v.sfx * 100);
  if (mb) {
    mb.textContent = v.muted ? 'UNMUTE' : 'MUTE';
    mb.classList.toggle('muted', !!v.muted);
  }
}

function bindVolumeUI() {
  const persist = () => {
    if (!game?.persistent) return;
    game.persistent.audio = Audio.getVolumes();
    game.saveNow();
  };
  document.getElementById('vol-master')?.addEventListener('input', (e) => {
    Audio.setVolumes({ master: e.target.value / 100 });
    persist();
  });
  document.getElementById('vol-music')?.addEventListener('input', (e) => {
    Audio.setVolumes({ music: e.target.value / 100 });
    persist();
  });
  document.getElementById('vol-sfx')?.addEventListener('input', (e) => {
    Audio.setVolumes({ sfx: e.target.value / 100 });
    persist();
  });
  document.getElementById('btn-mute')?.addEventListener('click', () => {
    Audio.setMuted(!Audio.isMuted());
    syncVolumeUI();
    persist();
  });
}
bindVolumeUI();

// Close-X buttons + tap-on-backdrop for map/galaxy. Pause and trade refuse
// backdrop-tap dismissal so the player doesn't accidentally lose modal state.
const closeHandlers = {
  resume:  () => game?.resume(),
  map:     () => panels.closeMap?.(),
  galaxy:  () => panels.closeGalaxy?.(),
  undock:  () => game?.playerActions?.undock()
};
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    closeHandlers[btn.dataset.close]?.();
  });
}
// Backdrop tap: close map/galaxy when tapping outside the inner card.
for (const overlayId of ['panel-map', 'panel-galaxy']) {
  const ov = document.getElementById(overlayId);
  ov?.addEventListener('click', (e) => {
    if (e.target === ov) {
      closeHandlers[ov.dataset.closeHandler]?.();
    }
  });
}

const panels = new Panels({
  onNewGame: (seedString) => {
    bootAudioFromGesture();
    if (!game) game = new Game(canvas, panels);
    panels.hideMenu();
    game.startNewGame(seedString);
    syncVolumeUI();
  },
  onContinue: () => {
    const profile = loadProfile();
    if (!profile) return;
    bootAudioFromGesture();
    if (!game) game = new Game(canvas, panels);
    panels.hideMenu();
    game.loadGame(profile);
    syncVolumeUI();
  },
  onDeleteSave: () => {
    deleteSave();
    panels.showMenu();
  },
  onResume: () => game?.resume(),
  onQuit: () => game?.quit(),
  onSave: () => {
    if (game?.saveNow()) game.world?.log('Game saved.', 'good');
  },
  onUndock: () => game?.playerActions?.undock(),
  onAfterTrade: (deltaSpent, station) => {
    // Trading at a faction's station nudges rep up slightly: +1 per ~500 cr.
    if (game?.world && station && typeof deltaSpent === 'number' && Math.abs(deltaSpent) > 0) {
      const bump = Math.min(2, Math.max(0.05, Math.abs(deltaSpent) / 500));
      game.world.adjustRep(station.faction, bump);
    }
    // Persist immediately after any module trade so the player doesn't have to.
    game?.saveNow();
  },
  onJumpTo: (systemId) => {
    if (!game) return;
    if (game.playerActions?.mode === 'docked') game.playerActions.undock();
    game.jumpToSystem(systemId);
  },
  onRepair: () => {
    if (!game?.playerActions?.docked) return;
    const p = game.world.player;
    if (p.credits < 200) return game.world.log('Not enough credits', 'bad');
    p.credits -= 200; p.hull = Math.min(p.maxHull, p.hull + p.maxHull * 0.5);
    game.world.log('Hull repaired', 'good');
    panels.refreshTrade();
    game.saveNow();
  },
  onRefuel: () => {
    if (!game?.playerActions?.docked) return;
    const p = game.world.player;
    if (p.credits < 100) return game.world.log('Not enough credits', 'bad');
    p.credits -= 100; p.shield = p.maxShield; p.energy = p.maxEnergy;
    game.world.log('Shields & cells topped off', 'good');
    panels.refreshTrade();
    game.saveNow();
  }
});

panels.showMenu();

// Periodic auto-save while playing.
setInterval(() => { game?.saveNow(); }, 30_000);
