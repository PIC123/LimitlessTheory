// Fullscreen helpers + button-state syncing. Works on Chromium, Firefox, Safari.

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch {
    // iOS Safari on iPhone refuses requestFullscreen; users still get the
    // viewport-fit hide via apple-mobile-web-app-capable when the app is
    // pinned to the home screen.
  }
}

export function isSupported() {
  return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
}

// Wire up two button elements (one in the HUD, one in the touch top bar) so
// they always reflect the current state.
export function bindButtons(...buttons) {
  buttons = buttons.filter(Boolean);
  for (const b of buttons) {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreen();
    });
  }
  const sync = () => {
    const inFs = isFullscreen();
    for (const b of buttons) {
      b.textContent = inFs ? '⛶' : '⛶';   // same glyph; class drives state
      b.classList.toggle('fs-on', inFs);
      b.title = inFs ? 'Exit fullscreen' : 'Enter fullscreen';
    }
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();

  // If unsupported, hide buttons.
  if (!isSupported()) for (const b of buttons) b.style.display = 'none';
}
