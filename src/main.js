import { Game } from './game.js';
import { Panels } from './ui/panels.js';
import { loadProfile, hasSave, deleteSave } from './core/save.js';
import * as Touch from './systems/touchControls.js';

const canvas = document.getElementById('view');
let game = null;

// Initialize touch overlay (no-op on desktop). Force=true with ?touch=1 for QA.
Touch.init({ force: new URLSearchParams(location.search).has('touch') });
Touch.setVisible(false); // hidden until we enter a game
// On phones, give the canvas the entire viewport including under the address bar.
if (Touch.isEnabled()) document.body.classList.add('mobile');

const panels = new Panels({
  onNewGame: (seedString) => {
    if (!game) game = new Game(canvas, panels);
    panels.hideMenu();
    game.startNewGame(seedString);
  },
  onContinue: () => {
    const profile = loadProfile();
    if (!profile) return;
    if (!game) game = new Game(canvas, panels);
    panels.hideMenu();
    game.loadGame(profile);
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
  onAfterTrade: () => {
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
