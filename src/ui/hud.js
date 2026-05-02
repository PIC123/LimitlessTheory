import * as THREE from 'three';
import { Items, ItemList } from '../core/items.js';
import { Factions, disposition, isHostile } from '../core/factions.js';

// HUD: speed/throttle/hull/shield/energy bars + target bracket + mini-map +
// toast log. The logic is plain DOM updates; canvas drawn for the radar.
export class HUD {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.el = {
      hud: document.getElementById('hud'),
      systemName: document.getElementById('hud-system-name'),
      credits: document.getElementById('hud-credits'),
      cargo: document.getElementById('hud-cargo'),
      hull: document.getElementById('hud-hull'),
      hullText: document.getElementById('hud-hull-text'),
      shield: document.getElementById('hud-shield'),
      shieldText: document.getElementById('hud-shield-text'),
      energy: document.getElementById('hud-energy'),
      energyText: document.getElementById('hud-energy-text'),
      speed: document.getElementById('hud-speed'),
      throttle: document.getElementById('hud-throttle'),
      mode: document.getElementById('hud-mode'),
      targetName: document.getElementById('hud-target-name'),
      targetInfo: document.getElementById('hud-target-info'),
      objective: document.getElementById('hud-objective'),
      bracket: document.getElementById('hud-target-bracket'),
      log: document.getElementById('hud-log'),
      mapCanvas: document.getElementById('hud-map-canvas')
    };
    this.shownLogs = new Set();
    this.toastTimer = null;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setObjective(text) { this.el.objective.textContent = text; }

  update(dt, mode = 'flight') {
    const p = this.world.player;
    if (!p) return;

    this.el.systemName.textContent = this.world.systemName;
    this.el.credits.textContent = `${p.credits | 0}`;
    this.el.cargo.textContent = `${p.cargoUsed()|0}/${p.cargoCap}`;
    this.el.mode.textContent = mode.toUpperCase();
    this._setBar(this.el.hull, this.el.hullText, p.hull, p.maxHull);
    this._setBar(this.el.shield, this.el.shieldText, p.shield, p.maxShield);
    this._setBar(this.el.energy, this.el.energyText, p.energy, p.maxEnergy);

    const speed = p.velocity.length();
    this.el.speed.textContent = `${(speed * 0.6) | 0} m/s${p.boost > 1.5 ? ' · BOOST' : ''}`;
    const tPct = Math.min(1, speed / 380);
    this.el.throttle.style.width = `${(tPct * 100) | 0}%`;

    // Target.
    const t = p.target;
    if (t && t.alive) {
      this.el.targetName.textContent = t.name || t.kind;
      const dist = p.position.distanceTo(t.position);
      const rel = isHostile(this.world, p.faction, t.faction) ? 'HOSTILE' : (t.faction === 'Player' || t.faction === 'Coalition' ? 'ALLY' : 'NEUTRAL');
      const hp = t.maxHull ? `${(t.hull|0)}/${t.maxHull|0} HP` : '';
      this.el.targetInfo.textContent = `${rel} · ${(dist*0.6)|0} m · ${hp}`;
      this._updateBracket(t);
    } else {
      this.el.targetName.textContent = '— none —';
      this.el.targetInfo.textContent = '';
      this.el.bracket.classList.add('hidden');
    }

    // Toast log.
    while (this.world.events.length) {
      const ev = this.world.events.shift();
      this._toast(ev.text, ev.level);
    }

    // Mini-map.
    this._drawMiniMap();
  }

  _setBar(bar, text, val, max) {
    const pct = Math.max(0, Math.min(1, val / max));
    bar.style.width = `${(pct * 100) | 0}%`;
    text.textContent = `${(val | 0)}/${max | 0}`;
  }

  _updateBracket(target) {
    const v = target.position.clone().project(this.camera);
    const inFront = v.z < 1 && v.z > -1;
    if (!inFront) { this.el.bracket.classList.add('hidden'); return; }
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    this.el.bracket.style.left = `${x}px`;
    this.el.bracket.style.top  = `${y}px`;
    this.el.bracket.classList.remove('hidden');
  }

  _toast(text, level) {
    const div = document.createElement('div');
    div.className = `toast ${level || ''}`;
    div.textContent = text;
    this.el.log.appendChild(div);
    setTimeout(() => div.remove(), 4000);
    // Cap log length.
    while (this.el.log.childElementCount > 6) this.el.log.firstChild.remove();
  }

  _drawMiniMap() {
    const cv = this.el.mapCanvas;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);

    // Translucent grid disk.
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 231, 255, 0.18)';
    ctx.lineWidth = 1;
    for (let r = 20; r <= 110; r += 22) {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-110, 0); ctx.lineTo(110, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -110); ctx.lineTo(0, 110); ctx.stroke();

    const p = this.world.player;
    if (!p) { ctx.restore(); return; }
    const range = 6000; // map shows 6 km radius
    // Camera-aligned XY: rotate so player faces "up".
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion);
    const yaw = Math.atan2(fwd.x, -fwd.z);

    for (const e of this.world.entities) {
      if (!e.alive || e === p) continue;
      const dx = e.position.x - p.position.x;
      const dz = e.position.z - p.position.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist > range) continue;
      const a = Math.atan2(dx, -dz) - yaw;
      const r = (dist / range) * 105;
      const x = Math.sin(a) * r;
      const y = -Math.cos(a) * r;

      let color = '#cfeaff';
      let size = 1.5;
      if (e.kind === 'asteroid') { color = '#776654'; size = 1; }
      else if (e.kind === 'station') { color = '#ff8a3d'; size = 3; }
      else if (e.kind === 'planet')  { color = '#6dffa0'; size = 4; }
      else if (e.kind === 'star')    { color = '#ffd23d'; size = 4; }
      else if (e.kind === 'ship') {
        if (isHostile(this.world, p.faction, e.faction)) color = '#ff476a';
        else if (e.faction === 'Coalition' || e.faction === 'Player') color = '#00e7ff';
        else color = '#ffd23d';
        size = 2;
      }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    }

    // Player triangle at origin pointing up.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
