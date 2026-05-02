// Touch controls: virtual joysticks + button cluster overlay.
// Layout (landscape):
//   ┌──────────────────────────────────────────────────────────┐
//   │ [PAUSE] [MAP] [GALAXY]                                   │
//   │                                                          │
//   │                       (HUD)                              │
//   │                                                          │
//   │                                                  [FIRE]  │
//   │                                                  [MINE]  │
//   │  [DOCK]                                          [BOOST] │
//   │  [TGT]                                           [BRAKE] │
//   │  [Q] [E]                                         [↑] [↓] │
//   │  ╭─────╮                                       ╭─────╮   │
//   │  ( LEFT )                                      ( RIGHT)  │
//   │  ╰─────╯                                       ╰─────╯   │
//   └──────────────────────────────────────────────────────────┘
//
// Left stick:  X = strafe L/R, Y = throttle (up = forward)
// Right stick: X = yaw, Y = pitch (up = pitch up)

const STICK_RADIUS = 50; // virtual radius in CSS px

const _state = {
  enabled: false,
  left:  { x: 0, y: 0, active: false, _id: null, _cx: 0, _cy: 0, _thumb: null },
  right: { x: 0, y: 0, active: false, _id: null, _cx: 0, _cy: 0, _thumb: null },
  buttons: {},          // name -> bool
  _pressed: new Set()   // edge-trigger; cleared each frame
};

export function isMobileLikely() {
  if (typeof navigator === 'undefined') return false;
  // Coarse pointer + touchpoints + (not desktop) + small screen heuristic.
  const coarse = matchMedia?.('(pointer: coarse)')?.matches;
  const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  return !!(coarse && hasTouch);
}

export function isEnabled() { return _state.enabled; }

// Public axis getters for flight control / player actions.
export function leftAxis() { return { x: _state.left.x, y: _state.left.y }; }
export function rightAxis() { return { x: _state.right.x, y: _state.right.y }; }
export function btn(name) { return !!_state.buttons[name]; }
export function pressed(name) { return _state._pressed.has(name); }

// Called by Input.endFrameInput() once per frame so edge-trigger presses are
// only seen for one tick.
export function endFrame() {
  _state._pressed.clear();
}

// Build the overlay DOM. Idempotent.
export function init({ force = false } = {}) {
  if (_state.enabled) return;
  _state.enabled = force || isMobileLikely();
  if (!_state.enabled) return;
  _build();
}

// Allow toggling visibility (e.g. hide while a panel is open).
export function setVisible(visible) {
  const el = document.getElementById('touch-overlay');
  if (el) el.classList.toggle('hidden', !visible);
}

function _build() {
  const wrap = document.createElement('div');
  wrap.id = 'touch-overlay';
  wrap.innerHTML = `
    <div class="touch-top">
      <button class="touch-mini" data-btn="pause">PAUSE</button>
      <button class="touch-mini" data-btn="map">MAP</button>
      <button class="touch-mini" data-btn="galaxy">GALAXY</button>
      <button class="touch-mini" data-btn="cam">CAM</button>
      <button class="touch-mini" id="touch-fullscreen" title="Fullscreen">⛶</button>
    </div>

    <div class="touch-left-cluster">
      <button class="touch-btn touch-btn-action" data-btn="dock">F<span>DOCK / JUMP</span></button>
      <button class="touch-btn" data-btn="target">TGT<span>TARGET</span></button>
      <div class="touch-roll-row">
        <button class="touch-btn small" data-btn="rollL">Q</button>
        <button class="touch-btn small" data-btn="rollR">E</button>
      </div>
    </div>

    <div class="touch-right-cluster">
      <button class="touch-btn touch-btn-fire" data-btn="fire">FIRE</button>
      <button class="touch-btn touch-btn-mine" data-btn="mine">MINE</button>
      <button class="touch-btn" data-btn="boost">BOOST</button>
      <button class="touch-btn" data-btn="brake">BRAKE</button>
      <div class="touch-strafe-row">
        <button class="touch-btn small" data-btn="up">↑</button>
        <button class="touch-btn small" data-btn="down">↓</button>
      </div>
    </div>

    <div class="touch-stick-zone touch-stick-left" id="touch-stick-left">
      <div class="touch-stick-base"></div>
      <div class="touch-stick-thumb" id="touch-thumb-left"></div>
      <div class="touch-stick-label">MOVE</div>
    </div>

    <div class="touch-stick-zone touch-stick-right" id="touch-stick-right">
      <div class="touch-stick-base"></div>
      <div class="touch-stick-thumb" id="touch-thumb-right"></div>
      <div class="touch-stick-label">LOOK</div>
    </div>
  `;
  document.body.appendChild(wrap);

  // Wire buttons.
  for (const el of wrap.querySelectorAll('[data-btn]')) {
    _setupButton(el, el.dataset.btn);
  }

  _state.left._thumb = document.getElementById('touch-thumb-left');
  _state.right._thumb = document.getElementById('touch-thumb-right');
  _setupStick(document.getElementById('touch-stick-left'),  _state.left);
  _setupStick(document.getElementById('touch-stick-right'), _state.right);

  // Prevent the global page from scrolling/zooming on touch even slightly.
  document.body.classList.add('touch-mode');

  // Safari quirk: prevent double-tap zoom on the canvas.
  const canvas = document.getElementById('view');
  if (canvas) {
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('gesturestart', (e) => e.preventDefault());
  }
}

function _setupButton(el, name) {
  // Press = pointerdown anywhere inside, release = pointerup.
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!_state.buttons[name]) _state._pressed.add(name);
    _state.buttons[name] = true;
    el.classList.add('pressed');
    try { el.setPointerCapture(e.pointerId); } catch {}
  });
  const release = (e) => {
    _state.buttons[name] = false;
    el.classList.remove('pressed');
    try { el.releasePointerCapture(e.pointerId); } catch {}
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  // Lost capture (e.g. UA-initiated) — clear state.
  el.addEventListener('lostpointercapture', () => {
    _state.buttons[name] = false;
    el.classList.remove('pressed');
  });
  // Block default click side-effects (focus, etc.).
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function _setupStick(el, state) {
  const computeCenter = () => {
    const r = el.getBoundingClientRect();
    state._cx = r.left + r.width / 2;
    state._cy = r.top + r.height / 2;
  };

  el.addEventListener('pointerdown', (e) => {
    if (state._id != null) return;
    e.preventDefault();
    state._id = e.pointerId;
    state.active = true;
    computeCenter();
    _updateStick(state, e.clientX, e.clientY);
    try { el.setPointerCapture(e.pointerId); } catch {}
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== state._id) return;
    e.preventDefault();
    _updateStick(state, e.clientX, e.clientY);
  });
  const release = (e) => {
    if (e.pointerId !== state._id) return;
    state._id = null;
    state.active = false;
    state.x = 0; state.y = 0;
    if (state._thumb) state._thumb.style.transform = `translate(0px, 0px)`;
    try { el.releasePointerCapture(e.pointerId); } catch {}
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', () => {
    state._id = null;
    state.active = false;
    state.x = 0; state.y = 0;
    if (state._thumb) state._thumb.style.transform = `translate(0px, 0px)`;
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function _updateStick(state, clientX, clientY) {
  const dx = clientX - state._cx;
  const dy = clientY - state._cy;
  const len = Math.sqrt(dx*dx + dy*dy);
  const max = STICK_RADIUS;
  const k = len > max ? max / len : 1;
  const tx = dx * k, ty = dy * k;
  // Apply a small dead zone so resting thumbs don't drift the ship.
  const dead = 0.08;
  let nx = tx / max, ny = ty / max;
  if (Math.abs(nx) < dead) nx = 0;
  if (Math.abs(ny) < dead) ny = 0;
  state.x = nx;
  state.y = ny;
  if (state._thumb) state._thumb.style.transform = `translate(${tx}px, ${ty}px)`;
}
