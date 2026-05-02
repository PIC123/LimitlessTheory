// Captures keyboard, mouse, and pointer-lock state. Exports a small helper
// other systems consume (`down(key)`, `pressed(key)`, mouse deltas).

import * as Touch from './touchControls.js';

const state = {
  keys: new Set(),
  pressedKeys: new Set(),  // keys that became down this frame
  releasedKeys: new Set(),
  mouseDX: 0, mouseDY: 0,
  mouseLeft: false, mouseRight: false,
  pressedMouseLeft: false, pressedMouseRight: false,
  pointerLocked: false,
  wheel: 0,
};

let _pendingPress = new Set();
let _pendingRelease = new Set();

export function initInput(canvas) {
  // Keyboard
  window.addEventListener('keydown', (e) => {
    const k = normalize(e);
    if (!state.keys.has(k)) _pendingPress.add(k);
    state.keys.add(k);
    // Prevent default for game keys to avoid scroll, etc.
    if (k === 'Space' || k.startsWith('Arrow') || k === 'KeyW' || k === 'KeyA' || k === 'KeyS' || k === 'KeyD') {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = normalize(e);
    state.keys.delete(k);
    _pendingRelease.add(k);
  });

  // Mouse: pointer lock
  canvas.addEventListener('click', () => {
    if (!state.pointerLocked && !document.querySelector('.overlay:not(.hidden)')) {
      canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    state.pointerLocked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (state.pointerLocked) {
      state.mouseDX += e.movementX;
      state.mouseDY += e.movementY;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { if (!state.mouseLeft) state.pressedMouseLeft = true; state.mouseLeft = true; }
    if (e.button === 2) { if (!state.mouseRight) state.pressedMouseRight = true; state.mouseRight = true; }
  });
  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.mouseLeft = false;
    if (e.button === 2) state.mouseRight = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    state.wheel += e.deltaY;
    e.preventDefault();
  }, { passive: false });
}

function normalize(e) { return e.code; }

export function consumeFrameInput() {
  state.pressedKeys = _pendingPress;
  state.releasedKeys = _pendingRelease;
  _pendingPress = new Set();
  _pendingRelease = new Set();
}

export function endFrameInput() {
  state.mouseDX = 0; state.mouseDY = 0;
  state.wheel = 0;
  state.pressedMouseLeft = false;
  state.pressedMouseRight = false;
  // Touch presses are edge-triggered too; clear them at the same point in the
  // frame as keyboard/mouse press flags.
  Touch.endFrame();
}

export function down(code) { return state.keys.has(code); }
export function pressed(code) { return state.pressedKeys.has(code); }
export function released(code) { return state.releasedKeys.has(code); }
export function mouseDelta() { return { x: state.mouseDX, y: state.mouseDY }; }
export function mouseLeft() { return state.mouseLeft; }
export function mouseRight() { return state.mouseRight; }
export function mouseLeftPressed() { return state.pressedMouseLeft; }
export function pointerLocked() { return state.pointerLocked; }
export function wheel() { return state.wheel; }

export function releasePointer() {
  if (state.pointerLocked) document.exitPointerLock?.();
}
