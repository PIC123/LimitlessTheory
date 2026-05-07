import { ItemList, Items } from '../core/items.js';
import { Modules, SLOTS, SLOT_LABEL, modulesBySlot, applyLoadout } from '../core/modules.js';
import { loadProfile, hasSave } from '../core/save.js';
import { Factions, relLabel, repColor, REP_MIN, REP_MAX } from '../core/factions.js';
import * as Audio from '../systems/audio.js';
import { ShipGarage } from './shipGarage.js';
import * as THREE from 'three';

// Wires the menu, pause, system-map, galaxy-map, and trade overlays.

export class Panels {
  constructor(opts) {
    this.opts = opts;
    this.menu = document.getElementById('menu');
    this.pause = document.getElementById('panel-pause');
    this.mapPanel = document.getElementById('panel-map');
    this.galaxyPanel = document.getElementById('panel-galaxy');
    this.tradePanel = document.getElementById('panel-trade');
    this.menuInfo = document.getElementById('menu-info');
    this.world = null;

    document.getElementById('btn-start').addEventListener('click', () => {
      const v = document.getElementById('seed-input').value.trim();
      this.opts.onNewGame(v);
    });
    document.getElementById('btn-continue').addEventListener('click', () => this.opts.onContinue?.());
    document.getElementById('btn-delete-save').addEventListener('click', () => this.opts.onDeleteSave?.());
    document.getElementById('btn-controls').addEventListener('click', () => this._showControls());
    document.getElementById('btn-credits').addEventListener('click', () => this._showAbout());
    document.getElementById('btn-resume').addEventListener('click', () => this.opts.onResume?.());
    document.getElementById('btn-save').addEventListener('click', () => this.opts.onSave?.());
    document.getElementById('btn-quit').addEventListener('click', () => this.opts.onQuit?.());
    document.getElementById('btn-close-map').addEventListener('click', () => this.closeMap());
    document.getElementById('btn-close-galaxy').addEventListener('click', () => this.closeGalaxy());
    document.getElementById('btn-undock').addEventListener('click', () => this.opts.onUndock?.());
    document.getElementById('btn-repair').addEventListener('click', () => this.opts.onRepair?.());
    document.getElementById('btn-refuel').addEventListener('click', () => this.opts.onRefuel?.());

    // Tabs
    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => this._selectTab(tab.dataset.tab));
    }

    // Galaxy canvas click → jump (if reachable)
    document.getElementById('galaxy-canvas').addEventListener('click', (e) => this._onGalaxyClick(e));
  }

  // ---- Menu ----
  showMenu(saveInfo) {
    this.menu.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.mapPanel.classList.add('hidden');
    this.galaxyPanel.classList.add('hidden');
    this.tradePanel.classList.add('hidden');
    // If caller passed a saveInfo use it; otherwise re-read from localStorage so
    // the continue button is always in sync with the actual save state.
    if (saveInfo === undefined) saveInfo = hasSave() ? loadProfile() : null;
    this._updateContinue(saveInfo);
  }
  _updateContinue(saveInfo) {
    const row = document.getElementById('menu-continue-row');
    const info = document.getElementById('menu-save-info');
    const cont = document.getElementById('btn-continue');
    const del  = document.getElementById('btn-delete-save');
    if (!saveInfo) {
      row.style.display = 'none';
      del.style.display = 'none';
      return;
    }
    row.style.display = 'flex';
    del.style.display = '';
    cont.disabled = false;
    const ago = humanAgo(saveInfo.savedAt);
    info.textContent = `Last saved ${ago} · system #${saveInfo.currentSystemId}`;
  }

  hideMenu() { this.menu.classList.add('hidden'); }

  showPause(world) {
    this._renderRepList(world);
    this.pause.classList.remove('hidden');
  }
  hidePause() { this.pause.classList.add('hidden'); }

  _renderRepList(world) {
    const list = document.getElementById('rep-list');
    if (!list) return;
    list.innerHTML = '';
    const rep = world?.reputation || {};
    for (const id of ['Coalition', 'Pirates', 'Traders']) {
      const value = Math.max(REP_MIN, Math.min(REP_MAX, rep[id] || 0));
      const fname = Factions[id].name;
      const row = document.createElement('div');
      row.className = 'rep-row';
      const pos = value >= 0;
      const widthPct = Math.abs(value) / 100 * 50; // each side max 50%
      const fillCls = value >= 50 ? 'good' : (value <= -50 ? 'bad' : '');
      row.innerHTML = `
        <div class="name">${fname}</div>
        <div class="rep-track">
          <div class="rep-fill ${fillCls}" style="${pos
            ? `left: 50%; width: ${widthPct}%`
            : `right: 50%; width: ${widthPct}%`}"></div>
        </div>
        <div class="label" style="color:${repColor(value)};">${relLabel(value)} ${value >= 0 ? '+' : ''}${value | 0}</div>`;
      list.appendChild(row);
    }
  }

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

NAV / META
  F                dock with station / activate jump gate / undock
  V                cycle camera mode (chase / cockpit / far)
  M                local system map
  G                galaxy map
  F5               quick save
  Esc              pause</pre>`;
  }

  _showAbout() {
    this.menuInfo.innerHTML = `
      <p>A modern, web-based reimagining of Josh Parnell's <i>Limit Theory</i>.
      The original game was an extraordinarily ambitious open-world space sim
      whose source was released after development was discontinued. This project
      faithfully channels its DNA: procedurally generated star systems, parametric
      ships and stations, action-stack AI, a flow-based market economy, modular
      ship sockets, jump gates linking a galaxy of systems, and a cyan-and-orange
      holographic HUD.</p>
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
    if (this._mapInterval) { clearInterval(this._mapInterval); this._mapInterval = null; }
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

    ctx.strokeStyle = 'rgba(0, 231, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let r = 1500; r <= 12000; r += 1500) {
      ctx.beginPath(); ctx.arc(cx, cy, r * scale, 0, Math.PI*2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();

    // Zones
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

    const p = this.world.player;
    for (const e of this.world.entities) {
      if (!e.alive) continue;
      const ex = cx + e.position.x * scale;
      const ey = cy + e.position.z * scale;
      let color = '#a0c0d0', r = 1;
      if (e.kind === 'station') {
        ctx.fillStyle = '#ff8a3d'; ctx.fillRect(ex-3, ey-3, 6, 6);
        ctx.fillStyle = '#ffd9b8'; ctx.fillText(e.name, ex+8, ey+4); continue;
      }
      if (e.kind === 'gate') {
        ctx.strokeStyle = '#00e7ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = '#cfeaff';
        ctx.fillText(e.name, ex+8, ey+4);
        continue;
      }
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

  // ---- Galaxy Map ----
  openGalaxy(galaxy, currentSystemId, visited) {
    this._galaxy = galaxy;
    this._galaxyCurrent = currentSystemId;
    this._galaxyVisited = visited || new Set([currentSystemId]);
    this.galaxyPanel.classList.remove('hidden');
    this._drawGalaxy();
  }
  closeGalaxy() {
    this.galaxyPanel.classList.add('hidden');
  }
  isGalaxyOpen() { return !this.galaxyPanel.classList.contains('hidden'); }

  _galaxyTransform() {
    const cv = document.getElementById('galaxy-canvas');
    const w = cv.width, h = cv.height;
    const cx = w/2, cy = h/2;
    const radius = Math.min(w, h) * 0.45;
    return { cv, w, h, cx, cy, radius };
  }

  _drawGalaxy() {
    const galaxy = this._galaxy;
    if (!galaxy) return;
    const { cv, w, h, cx, cy, radius } = this._galaxyTransform();
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0, 231, 255, 0.1)';
    ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.stroke();

    const cur = galaxy.systemById(this._galaxyCurrent);
    const reachable = new Set(cur.neighbors);

    // Edges
    ctx.strokeStyle = 'rgba(0, 231, 255, 0.18)';
    ctx.lineWidth = 1;
    const seenPairs = new Set();
    for (const s of galaxy.systems) {
      const sx = cx + s.pos.x * radius;
      const sy = cy + s.pos.y * radius;
      for (const nbId of s.neighbors) {
        const key = s.id < nbId ? `${s.id}-${nbId}` : `${nbId}-${s.id}`;
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        const nb = galaxy.systemById(nbId);
        const nx = cx + nb.pos.x * radius;
        const ny = cy + nb.pos.y * radius;
        const isCurEdge = s.id === this._galaxyCurrent || nbId === this._galaxyCurrent;
        ctx.strokeStyle = isCurEdge ? 'rgba(0, 231, 255, 0.65)' : 'rgba(0, 231, 255, 0.18)';
        ctx.lineWidth = isCurEdge ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(nx, ny); ctx.stroke();
      }
    }

    // Nodes
    for (const s of galaxy.systems) {
      const sx = cx + s.pos.x * radius;
      const sy = cy + s.pos.y * radius;
      const isCur = s.id === this._galaxyCurrent;
      const visited = this._galaxyVisited.has(s.id);
      const reach = reachable.has(s.id);

      let color = '#776654', dotR = 6;
      if (visited) color = '#00e7ff';
      if (reach && !isCur) color = '#ffd23d';
      if (isCur) { color = '#fff'; dotR = 9; }

      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(sx, sy, dotR, 0, Math.PI*2); ctx.fill();
      if (isCur) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, dotR + 5, 0, Math.PI*2); ctx.stroke();
      }
      ctx.fillStyle = visited || reach ? '#cfeaff' : '#7a8390';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(s.name, sx + 12, sy + 4);
    }

    // Save the latest reachable for click-handling.
    this._galaxyReachable = reachable;
  }

  _onGalaxyClick(e) {
    if (!this._galaxy) return;
    const { cv, cx, cy, radius } = this._galaxyTransform();
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = null, bestD = 16 * 16;
    for (const s of this._galaxy.systems) {
      const sx = cx + s.pos.x * radius;
      const sy = cy + s.pos.y * radius;
      const d = (sx - mx) * (sx - mx) + (sy - my) * (sy - my);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) return;
    if (best.id === this._galaxyCurrent) return;
    if (!this._galaxyReachable.has(best.id)) return;
    this.opts.onJumpTo?.(best.id);
    this.closeGalaxy();
  }

  // ---- Trade panel (now tabbed) ----
  openTrade(station, player, world) {
    this._tradeStation = station; this._tradePlayer = player; this._world = world || null;
    document.getElementById('trade-title').textContent = `${station.name}`;
    this._selectTab('trade');
    this._renderStationHeader();
    this._renderTrade();
    this._renderOutfit();
    this.tradePanel.classList.remove('hidden');
  }
  closeTrade() {
    this.tradePanel.classList.add('hidden');
    this._tradeStation = null; this._tradePlayer = null;
    this._closeGarage();
  }
  isTradeOpen() { return !this.tradePanel.classList.contains('hidden'); }

  _selectTab(name) {
    for (const tab of document.querySelectorAll('.tab')) {
      tab.classList.toggle('active', tab.dataset.tab === name);
    }
    for (const panel of document.querySelectorAll('.tab-panel')) {
      panel.classList.toggle('hidden', panel.dataset.tabPanel !== name);
    }
    if (name === 'garage') this._openGarage();
    else this._closeGarage();
    Audio.uiBeep();
  }

  _ensureGarage() {
    if (this._garage) return this._garage;
    const canvas = document.getElementById('garage-canvas');
    if (!canvas) return null;
    this._garage = new ShipGarage(canvas);
    this._buildGarageControls();
    return this._garage;
  }

  _openGarage() {
    const g = this._ensureGarage();
    if (!g) return;
    const player = this._tradePlayer;
    const appearance = (player?.metadata?.appearance) || this._defaultAppearance();
    this._renderGarageState(appearance);
    g.open(appearance);
  }

  _closeGarage() {
    if (this._garage) this._garage.close();
  }

  _defaultAppearance() {
    return {
      role: 'fighter',
      hullColor: 0x2a2f38,
      accentColor: 0x00e7ff,
      cockpitColor: 0x00121a,
      seed: 0xC0FFEE
    };
  }

  // Build the garage's static controls (swatches + role buttons + pickers).
  // Run once at init; the active-state highlighting is updated via
  // _renderGarageState() each time the tab opens or a value changes.
  _buildGarageControls() {
    // Roles
    const rolesEl = document.getElementById('garage-roles');
    rolesEl.innerHTML = '';
    for (const r of ShipGarage.ROLES) {
      const b = document.createElement('button');
      b.className = 'garage-role';
      b.dataset.role = r.id;
      b.innerHTML = `${r.label}<span class="desc">${r.desc}</span>`;
      b.addEventListener('click', () => this._applyAppearance({ role: r.id }));
      rolesEl.appendChild(b);
    }

    // Swatches: hull + accent.
    const wireSwatches = (target, presets) => {
      const grid = document.querySelector(`.garage-swatches[data-target="${target}"]`);
      if (!grid) return;
      grid.innerHTML = '';
      for (const p of presets) {
        const sw = document.createElement('div');
        sw.className = 'garage-swatch';
        sw.dataset.color = p.color;
        sw.style.background = `#${p.color.toString(16).padStart(6, '0')}`;
        sw.title = p.label;
        sw.addEventListener('click', () => this._applyAppearance({ [target]: p.color }));
        grid.appendChild(sw);
      }
    };
    wireSwatches('hullColor', ShipGarage.HULL_PRESETS);
    wireSwatches('accentColor', ShipGarage.ACCENT_PRESETS);

    // Custom color pickers.
    document.getElementById('garage-hull-pick')?.addEventListener('input', (e) => {
      this._applyAppearance({ hullColor: parseInt(e.target.value.slice(1), 16) });
    });
    document.getElementById('garage-accent-pick')?.addEventListener('input', (e) => {
      this._applyAppearance({ accentColor: parseInt(e.target.value.slice(1), 16) });
    });
    document.getElementById('garage-cockpit-pick')?.addEventListener('input', (e) => {
      this._applyAppearance({ cockpitColor: parseInt(e.target.value.slice(1), 16) });
    });
    document.getElementById('garage-randomize')?.addEventListener('click', () => {
      this._applyAppearance({ seed: (Math.random() * 0xffffffff) >>> 0 });
    });
  }

  _renderGarageState(appearance) {
    // Swatches
    for (const sw of document.querySelectorAll('.garage-swatches[data-target="hullColor"] .garage-swatch')) {
      sw.classList.toggle('active', parseInt(sw.dataset.color) === appearance.hullColor);
    }
    for (const sw of document.querySelectorAll('.garage-swatches[data-target="accentColor"] .garage-swatch')) {
      sw.classList.toggle('active', parseInt(sw.dataset.color) === appearance.accentColor);
    }
    // Roles
    for (const b of document.querySelectorAll('.garage-role')) {
      b.classList.toggle('active', b.dataset.role === appearance.role);
    }
    // Custom pickers reflect current values.
    const toHex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
    const h = document.getElementById('garage-hull-pick');     if (h) h.value = toHex(appearance.hullColor);
    const a = document.getElementById('garage-accent-pick');   if (a) a.value = toHex(appearance.accentColor);
    const c = document.getElementById('garage-cockpit-pick');  if (c) c.value = toHex(appearance.cockpitColor || 0x00121a);
  }

  // Merge a partial appearance change, push to the live world ship + the
  // garage preview, and notify the host (Game) so it can persist + save.
  _applyAppearance(partial) {
    const player = this._tradePlayer;
    if (!player) return;
    const cur = player.metadata.appearance || this._defaultAppearance();
    const next = { ...cur, ...partial };
    player.metadata.appearance = next;
    if (this._garage) this._garage.setAppearance(next);
    this._renderGarageState(next);
    this.opts.onAppearanceChange?.(next);
  }

  refreshTrade() {
    if (!this._tradeStation || !this._tradePlayer) return;
    this._renderStationHeader();
    this._renderTrade();
    this._renderOutfit();
  }

  _renderStationHeader() {
    const p = this._tradePlayer;
    const s = this._tradeStation;
    if (!p || !s) return;
    document.getElementById('station-credits').textContent = `${p.credits | 0}`;
    document.getElementById('station-hold').textContent = `${p.cargoUsed()|0}/${p.cargoCap}`;
    document.getElementById('station-hull').textContent = `${p.hull|0}/${p.maxHull|0}`;
    document.getElementById('station-shield').textContent = `${p.shield|0}/${p.maxShield|0}`;
    const repEl = document.getElementById('station-rep');
    if (repEl && this._world?.reputation) {
      const r = this._world.reputation[s.faction] ?? 0;
      repEl.textContent = `${relLabel(r)} ${r >= 0 ? '+' : ''}${r | 0}`;
      repEl.style.color = repColor(r);
    } else if (repEl) {
      repEl.textContent = '—';
    }
  }

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

  _renderOutfit() {
    const station = this._tradeStation, player = this._tradePlayer;
    if (!station || !player) return;
    const stock = station.metadata.outfit || {};
    const loadout = player.metadata.loadout || {};
    const hangar = player.metadata.hangar || [];

    const marketEl = document.getElementById('outfit-market');
    const hangarEl = document.getElementById('outfit-hangar');
    marketEl.innerHTML = '';
    hangarEl.innerHTML = '';

    for (const slot of SLOTS) {
      const slotMarket = Object.values(stock).filter(s => s.module.slot === slot);
      if (!slotMarket.length) continue;
      const section = document.createElement('div');
      section.className = 'outfit-section';
      section.innerHTML = `<h4>${SLOT_LABEL[slot]}</h4>`;
      slotMarket.sort((a, b) => a.module.tier - b.module.tier);
      for (const entry of slotMarket) {
        const m = entry.module;
        const equipped = loadout[slot] === m.id;
        const owned = hangar.includes(m.id);
        const row = document.createElement('div');
        row.className = `outfit-row ${equipped ? 'equipped' : ''}`;
        row.innerHTML = `
          <div>
            <div class="name">${m.label} <span class="tier">·  Mk${m.tier}</span></div>
            <div class="desc">${m.desc}</div>
          </div>
          <div class="tier">x${entry.count}</div>
          <div class="price">${m.price} cr</div>
          <div></div>`;
        const actionCell = row.lastElementChild;
        if (equipped) {
          actionCell.innerHTML = `<span style="color:var(--cyan);font-size:10px;letter-spacing:1.5px;">EQUIPPED</span>`;
        } else if (owned) {
          const btn = document.createElement('button');
          btn.textContent = 'EQUIP';
          btn.addEventListener('click', () => this._equip(m));
          actionCell.appendChild(btn);
        } else {
          const btn = document.createElement('button');
          btn.textContent = 'BUY';
          btn.disabled = player.credits < m.price || entry.count <= 0;
          btn.addEventListener('click', () => this._buyModule(m));
          actionCell.appendChild(btn);
        }
        section.appendChild(row);
      }
      marketEl.appendChild(section);
    }

    // Hangar: list currently-equipped + spare modules
    const hangarSec = document.createElement('div');
    hangarSec.className = 'outfit-section';
    hangarSec.innerHTML = `<h4>Currently Equipped</h4>`;
    for (const slot of SLOTS) {
      const id = loadout[slot];
      const m = Modules[id];
      if (!m) continue;
      const row = document.createElement('div');
      row.className = 'outfit-row equipped';
      row.innerHTML = `
        <div>
          <div class="name">${SLOT_LABEL[slot]}: ${m.label} <span class="tier">·  Mk${m.tier}</span></div>
          <div class="desc">${m.desc}</div>
        </div>
        <div class="tier">—</div>
        <div class="price"></div>
        <div></div>`;
      hangarSec.appendChild(row);
    }
    hangarEl.appendChild(hangarSec);

    if (hangar.length > 0) {
      const sparesSec = document.createElement('div');
      sparesSec.className = 'outfit-section';
      sparesSec.innerHTML = `<h4>Spare Modules</h4>`;
      const counts = new Map();
      for (const id of hangar) counts.set(id, (counts.get(id) || 0) + 1);
      for (const [id, count] of counts.entries()) {
        const m = Modules[id];
        if (!m) continue;
        const equipped = loadout[m.slot] === id;
        const row = document.createElement('div');
        row.className = 'outfit-row';
        row.innerHTML = `
          <div>
            <div class="name">${m.label} <span class="tier">·  Mk${m.tier}</span></div>
            <div class="desc">${SLOT_LABEL[m.slot]}</div>
          </div>
          <div class="tier">x${count}</div>
          <div class="price">${Math.floor(m.price * 0.4)} cr</div>
          <div></div>`;
        const cell = row.lastElementChild;
        if (!equipped) {
          const eq = document.createElement('button');
          eq.textContent = 'EQUIP';
          eq.addEventListener('click', () => this._equip(m));
          cell.appendChild(eq);
        }
        const sell = document.createElement('button');
        sell.textContent = 'SELL';
        sell.addEventListener('click', () => this._sellModule(m));
        cell.appendChild(sell);
        sparesSec.appendChild(row);
      }
      hangarEl.appendChild(sparesSec);
    }
  }

  // ---- Trade actions ----
  _buy(item) {
    const m = this._tradeStation.metadata.market[item.id];
    const p = this._tradePlayer;
    if (p.credits < m.sellPrice || m.stock <= 0) return;
    if (p.cargoUsed() >= p.cargoCap) return;
    p.credits -= m.sellPrice;
    m.stock -= 1;
    p.cargoAdd(item.id, 1);
    m.sellPrice = Math.max(1, Math.round(m.sellPrice * 1.005));
    this._lastSpent = (this._lastSpent || 0) + m.sellPrice;
    this.opts.onAfterTrade?.(m.sellPrice, this._tradeStation);
    this._lastSpent = 0;
    Audio.trade();
    this.refreshTrade();
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
    // Selling also nudges rep but at half rate (not buying their goods).
    this.opts.onAfterTrade?.(m.buyPrice * 0.5, this._tradeStation);
    Audio.trade();
    this.refreshTrade();
  }
  _buyModule(mod) {
    const station = this._tradeStation;
    const p = this._tradePlayer;
    const entry = station.metadata.outfit[mod.id];
    if (!entry || entry.count <= 0) return;
    if (p.credits < mod.price) return;
    p.credits -= mod.price;
    entry.count -= 1;
    p.metadata.hangar = p.metadata.hangar || [];
    p.metadata.hangar.push(mod.id);
    this.opts.onAfterTrade?.(mod.price, this._tradeStation);
    Audio.trade();
    this.refreshTrade();
  }
  _sellModule(mod) {
    const p = this._tradePlayer;
    const idx = p.metadata.hangar.indexOf(mod.id);
    if (idx < 0) return;
    p.metadata.hangar.splice(idx, 1);
    const refund = Math.floor(mod.price * 0.4);
    p.credits += refund;
    this.opts.onAfterTrade?.(refund * 0.5, this._tradeStation);
    Audio.trade();
    this.refreshTrade();
  }
  _equip(mod) {
    const p = this._tradePlayer;
    const cur = p.metadata.loadout[mod.slot];
    // Move newly-equipped out of hangar; move previous module into hangar.
    p.metadata.hangar = p.metadata.hangar || [];
    const idx = p.metadata.hangar.indexOf(mod.id);
    if (idx >= 0) p.metadata.hangar.splice(idx, 1);
    if (cur && cur !== mod.id) p.metadata.hangar.push(cur);
    const newLoadout = { ...p.metadata.loadout, [mod.slot]: mod.id };
    applyLoadout(p, newLoadout);
    // Equipping doesn't move credits, so don't bump rep — just persist.
    this.opts.onAfterTrade?.(0, this._tradeStation);
    Audio.uiBeep();
    this.refreshTrade();
  }
}

function humanAgo(ts) {
  if (!ts) return 'recently';
  const s = Math.max(0, (Date.now() - ts) / 1000) | 0;
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${(s/60)|0}m ago`;
  if (s < 86400) return `${(s/3600)|0}h ago`;
  return `${(s/86400)|0}d ago`;
}
