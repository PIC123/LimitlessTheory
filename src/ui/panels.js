import { ItemList, Items } from '../core/items.js';
import * as THREE from 'three';

// Wires the menu, pause, system-map, and trade overlays. Pure DOM — no framework.

export class Panels {
  constructor(opts) {
    this.opts = opts; // { onStart(seed), onResume(), onQuit(), onMapToggle(open) }
    this.menu = document.getElementById('menu');
    this.pause = document.getElementById('panel-pause');
    this.mapPanel = document.getElementById('panel-map');
    this.tradePanel = document.getElementById('panel-trade');
    this.menuInfo = document.getElementById('menu-info');
    this.world = null;

    document.getElementById('btn-start').addEventListener('click', () => {
      const v = document.getElementById('seed-input').value.trim();
      this.opts.onStart(v);
    });
    document.getElementById('btn-controls').addEventListener('click', () => this._showControls());
    document.getElementById('btn-credits').addEventListener('click', () => this._showAbout());
    document.getElementById('btn-resume').addEventListener('click', () => this.opts.onResume?.());
    document.getElementById('btn-quit').addEventListener('click', () => this.opts.onQuit?.());
    document.getElementById('btn-close-map').addEventListener('click', () => this.closeMap());
    document.getElementById('btn-undock').addEventListener('click', () => this.opts.onUndock?.());

    document.getElementById('btn-repair').addEventListener('click', () => this.opts.onRepair?.());
    document.getElementById('btn-refuel').addEventListener('click', () => this.opts.onRefuel?.());
    document.getElementById('btn-upgrade').addEventListener('click', () => this.opts.onUpgrade?.());
  }

  showMenu() {
    this.menu.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.mapPanel.classList.add('hidden');
    this.tradePanel.classList.add('hidden');
  }

  hideMenu() { this.menu.classList.add('hidden'); }

  showPause() { this.pause.classList.remove('hidden'); }
  hidePause() { this.pause.classList.add('hidden'); }

  setWorld(world) { this.world = world; }

  _showControls() {
    this.menuInfo.innerHTML = `
<pre>FLIGHT
  W / S    forward / reverse thrust
  A / D    strafe left / right
  Space / Ctrl   strafe up / down
  Q / E    roll
  Mouse    yaw / pitch (click to capture)
  Shift    afterburner (boost)
  X        airbrake

COMBAT
  LMB / Space      fire bolts
  RMB / M          mining laser
  T                target nearest hostile
  Y                target nearest ore asteroid
  Tab              cycle ships
  R                clear target

NAV
  F                dock with nearest station / undock
  Esc              pause
  M                large system map</pre>`;
  }

  _showAbout() {
    this.menuInfo.innerHTML = `
      <p>A modern, web-based reimagining of Josh Parnell's <i>Limit Theory</i>.
      The original game was an extraordinarily ambitious open-world space sim
      whose source was released after development was discontinued. This project
      faithfully channels its DNA: procedurally generated star systems, parametric
      ships and stations, action-stack AI, a flow-based market economy, and a
      cyan-and-orange holographic HUD.</p>
      <p>Original code: <code>JoshParnell/ltheory</code></p>`;
  }

  // ---- System Map (large) ----
  openMap(world) {
    this.world = world;
    this.mapPanel.classList.remove('hidden');
    document.getElementById('map-title').textContent = world.systemName;
    this._drawLargeMap();
    this._mapInterval = setInterval(() => this._drawLargeMap(), 200);
  }
  closeMap() {
    this.mapPanel.classList.add('hidden');
    if (this._mapInterval) clearInterval(this._mapInterval);
  }
  isMapOpen() { return !this.mapPanel.classList.contains('hidden'); }

  _drawLargeMap() {
    const cv = document.getElementById('map-large');
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);

    if (!this.world) return;
    const range = 12000;
    const cx = w/2, cy = h/2;
    const scale = (Math.min(w, h) * 0.45) / range;

    // Grid.
    ctx.strokeStyle = 'rgba(0, 231, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let r = 1500; r <= 12000; r += 1500) {
      ctx.beginPath(); ctx.arc(cx, cy, r * scale, 0, Math.PI*2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();

    // Zones.
    ctx.strokeStyle = 'rgba(0, 231, 255, 0.18)';
    ctx.fillStyle = 'rgba(0, 231, 255, 0.04)';
    for (const z of this.world.zones) {
      const zx = cx + z.pos.x * scale;
      const zy = cy + z.pos.z * scale;
      ctx.beginPath(); ctx.arc(zx, zy, 2200 * scale, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0, 231, 255, 0.6)';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(z.name, zx + 6, zy - 8);
      ctx.fillStyle = 'rgba(0, 231, 255, 0.04)';
    }

    // Entities.
    const p = this.world.player;
    for (const e of this.world.entities) {
      if (!e.alive) continue;
      const ex = cx + e.position.x * scale;
      const ey = cy + e.position.z * scale;
      let color = '#a0c0d0', r = 1;
      if (e.kind === 'station') { color = '#ff8a3d'; r = 4; ctx.fillStyle = color; ctx.fillRect(ex-3, ey-3, 6, 6); ctx.fillStyle='#ffd9b8'; ctx.fillText(e.name, ex+8, ey+4); continue; }
      if (e.kind === 'planet')  { color = '#6dffa0'; r = 6; }
      if (e.kind === 'asteroid'){ color = e.metadata.ore ? '#ffd23d' : '#776654'; r = 1; }
      if (e.kind === 'star')    { color = '#ffd23d'; r = 8; }
      if (e.kind === 'ship') {
        if (e === p) { color = '#fff'; r = 5; }
        else if (e.faction === 'Pirates') { color = '#ff476a'; r = 3; }
        else if (e.faction === 'Coalition') { color = '#00e7ff'; r = 3; }
        else { color = '#ffd23d'; r = 3; }
      }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI*2); ctx.fill();
    }

    // Player heading line.
    if (p) {
      const px = cx + p.position.x * scale;
      const pz = cy + p.position.z * scale;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, pz);
      ctx.lineTo(px + fwd.x * 30, pz + fwd.z * 30);
      ctx.stroke();
    }
  }

  // ---- Trade ----
  openTrade(station, player) {
    this._tradeStation = station; this._tradePlayer = player;
    document.getElementById('trade-title').textContent = `${station.name} — TRADING`;
    this._renderTrade();
    this.tradePanel.classList.remove('hidden');
  }
  closeTrade() {
    this.tradePanel.classList.add('hidden');
    this._tradeStation = null; this._tradePlayer = null;
  }
  isTradeOpen() { return !this.tradePanel.classList.contains('hidden'); }
  _renderTrade() {
    const station = this._tradeStation, player = this._tradePlayer;
    if (!station || !player) return;
    const market = station.metadata.market;
    const marketEl = document.getElementById('trade-market');
    const holdEl = document.getElementById('trade-hold');
    marketEl.innerHTML = '';
    holdEl.innerHTML = '';

    for (const item of ItemList) {
      const m = market[item.id];
      const row = document.createElement('div');
      row.className = 'trade-row';
      row.innerHTML = `
        <div class="name">${item.label}</div>
        <div class="qty">${m.stock}</div>
        <div class="price">${m.sellPrice} cr</div>
        <button ${player.credits < m.sellPrice || (player.cargoUsed() >= player.cargoCap) || m.stock <= 0 ? 'disabled' : ''}>BUY</button>`;
      row.querySelector('button').addEventListener('click', () => this._buy(item));
      marketEl.appendChild(row);
    }

    for (const item of ItemList) {
      const have = player.cargo.get(item.id) || 0;
      if (have <= 0) continue;
      const m = market[item.id];
      const row = document.createElement('div');
      row.className = 'trade-row';
      row.innerHTML = `
        <div class="name">${item.label}</div>
        <div class="qty">${have}</div>
        <div class="price">${m.buyPrice} cr</div>
        <button>SELL</button>`;
      row.querySelector('button').addEventListener('click', () => this._sell(item));
      holdEl.appendChild(row);
    }
    if (!holdEl.childElementCount) {
      holdEl.innerHTML = '<div style="color:#6890a8;padding:6px 8px;font-size:11px;">Hold is empty.</div>';
    }
  }
  _buy(item) {
    const m = this._tradeStation.metadata.market[item.id];
    const p = this._tradePlayer;
    if (p.credits < m.sellPrice || m.stock <= 0) return;
    if (p.cargoUsed() >= p.cargoCap) return;
    p.credits -= m.sellPrice;
    m.stock -= 1;
    p.cargoAdd(item.id, 1);
    // Slight market drift.
    m.sellPrice = Math.max(1, Math.round(m.sellPrice * 1.005));
    this._renderTrade();
  }
  _sell(item) {
    const m = this._tradeStation.metadata.market[item.id];
    const p = this._tradePlayer;
    const have = p.cargo.get(item.id) || 0;
    if (have <= 0) return;
    p.cargoRemove(item.id, 1);
    m.stock += 1;
    p.credits += m.buyPrice;
    m.buyPrice = Math.max(1, Math.round(m.buyPrice * 0.995));
    this._renderTrade();
  }
}
