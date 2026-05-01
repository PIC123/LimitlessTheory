import { Game } from './game.js';
import { Panels } from './ui/panels.js';

const canvas = document.getElementById('view');
let game = null;

const panels = new Panels({
  onStart: (seedString) => {
    if (!game) game = new Game(canvas, panels);
    panels.hideMenu();
    game.start(seedString);
  },
  onResume: () => game?.resume(),
  onQuit: () => game?.quit(),
  onUndock: () => game?.playerActions?.undock(),
  onRepair: () => {
    if (!game?.playerActions?.docked) return;
    const p = game.world.player;
    if (p.credits < 200) return game.world.log('Not enough credits', 'bad');
    p.credits -= 200; p.hull = Math.min(p.maxHull, p.hull + p.maxHull * 0.5);
    game.world.log('Hull repaired', 'good');
  },
  onRefuel: () => {
    if (!game?.playerActions?.docked) return;
    const p = game.world.player;
    if (p.credits < 100) return game.world.log('Not enough credits', 'bad');
    p.credits -= 100; p.shield = p.maxShield; p.energy = p.maxEnergy;
    game.world.log('Shields & cells topped off', 'good');
  },
  onUpgrade: () => {
    if (!game?.playerActions?.docked) return;
    const p = game.world.player;
    if (p.credits < 1500) return game.world.log('Not enough credits (1500 cr)', 'bad');
    p.credits -= 1500;
    p.weapon.dmg = Math.round(p.weapon.dmg * 1.25);
    p.weapon.range += 200;
    p.maxShield += 30; p.shield = p.maxShield;
    game.world.log(`Upgraded weapons! +25% damage, +200 range`, 'good');
  }
});

panels.showMenu();
