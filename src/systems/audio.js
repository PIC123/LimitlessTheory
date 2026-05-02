// Web Audio synthesis for Limitless Theory.
//
// Design: we synthesize *everything* — no .mp3 assets ship with the build.
// One AudioContext, three buses (music / sfx / master). Continuous sounds
// (engine, mining laser) own a node graph that the game ramps each frame;
// one-shot SFX spin up new oscillators that auto-stop. The generative
// soundtrack schedules ahead of the audio clock so it stays glitch-free
// even on slow main threads.
//
// Browsers block AudioContext until a user gesture, so init() is called
// from the New Game / Continue click and is a no-op if it fails.

let _ctx = null;
let _master, _musicBus, _sfxBus;
let _noiseBuf = null;

let _volumes = { master: 0.7, music: 0.45, sfx: 0.75 };
let _muted = false;

let _engine = null;       // { gain, filter, src, target }
let _mining = null;       // { gain, src }
let _music  = null;       // scheduler state
let _warning = null;      // looping warning beep

// ---------- Lifecycle ----------

export function isInitialized() { return !!_ctx; }

export function init() {
  if (_ctx) return _ctx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _ctx = new Ctx();
  } catch { return null; }

  _master = _ctx.createGain();
  _musicBus = _ctx.createGain();
  _sfxBus = _ctx.createGain();
  _musicBus.connect(_master);
  _sfxBus.connect(_master);
  _master.connect(_ctx.destination);
  _applyVolumes();

  _noiseBuf = _makeNoiseBuffer(2.0);
  return _ctx;
}

export function resume() {
  if (_ctx?.state === 'suspended') _ctx.resume().catch(() => {});
}

export function setVolumes(partial) {
  Object.assign(_volumes, partial);
  if (_ctx) _applyVolumes();
}
export function getVolumes() { return { ..._volumes, muted: _muted }; }

export function setMuted(m) {
  _muted = !!m;
  if (_ctx) _applyVolumes();
}
export function isMuted() { return _muted; }

function _applyVolumes() {
  _master.gain.value = _muted ? 0 : _volumes.master;
  _musicBus.gain.value = _volumes.music;
  _sfxBus.gain.value = _volumes.sfx;
}

// ---------- Helpers ----------

function _makeNoiseBuffer(seconds) {
  const sr = _ctx.sampleRate;
  const buf = _ctx.createBuffer(1, sr * seconds, sr);
  const ch = buf.getChannelData(0);
  // Pink-ish noise via Voss algorithm (good enough; cheap).
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for (let i = 0; i < ch.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    ch[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

function _envGain(when, attack, hold, release, peak = 1) {
  const g = _ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  g.gain.setValueAtTime(peak, when + attack + hold);
  g.gain.linearRampToValueAtTime(0, when + attack + hold + release);
  return g;
}

function _hzFromMidi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

// ---------- One-shot SFX ----------

export function uiBeep() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const o = _ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = 720;
  const g = _envGain(t, 0.005, 0.02, 0.05, 0.2);
  o.connect(g); g.connect(_sfxBus);
  o.start(t); o.stop(t + 0.1);
}

export function targetLock() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    const o = _ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = i === 0 ? 880 : 1320;
    const g = _envGain(t + i * 0.06, 0.005, 0.02, 0.06, 0.18);
    o.connect(g); g.connect(_sfxBus);
    o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.1);
  }
}

export function fire() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const o = _ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(1400, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
  const f = _ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(2200, t);
  f.frequency.exponentialRampToValueAtTime(400, t + 0.12);
  const g = _envGain(t, 0.002, 0.01, 0.13, 0.35);
  o.connect(f); f.connect(g); g.connect(_sfxBus);
  o.start(t); o.stop(t + 0.16);
}

export function boltHit() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const n = _ctx.createBufferSource();
  n.buffer = _noiseBuf;
  const f = _ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 600;
  f.Q.value = 0.8;
  const g = _envGain(t, 0.001, 0, 0.08, 0.45);
  n.connect(f); f.connect(g); g.connect(_sfxBus);
  n.start(t); n.stop(t + 0.1);
}

export function shieldHit() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  // Energy-zap: short FM sweep
  const car = _ctx.createOscillator();
  const mod = _ctx.createOscillator();
  const modGain = _ctx.createGain();
  car.frequency.value = 520;
  mod.frequency.value = 80;
  modGain.gain.value = 200;
  mod.connect(modGain); modGain.connect(car.frequency);
  car.frequency.exponentialRampToValueAtTime(180, t + 0.18);
  const g = _envGain(t, 0.003, 0.02, 0.18, 0.35);
  car.connect(g); g.connect(_sfxBus);
  car.start(t); mod.start(t);
  car.stop(t + 0.22); mod.stop(t + 0.22);
}

export function explode(scale = 1) {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const dur = 0.6 + Math.min(1.5, scale * 0.4);
  // Body: lowpass-swept noise.
  const n = _ctx.createBufferSource();
  n.buffer = _noiseBuf;
  const f = _ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900 + scale * 400, t);
  f.frequency.exponentialRampToValueAtTime(80, t + dur);
  const g = _envGain(t, 0.005, 0.02, dur, Math.min(0.85, 0.4 + scale * 0.15));
  n.connect(f); f.connect(g); g.connect(_sfxBus);
  n.start(t); n.stop(t + dur + 0.05);
  // Sub-thud: low sine that drops in pitch.
  const o = _ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
  const og = _envGain(t, 0.002, 0.05, 0.5, Math.min(0.5, 0.2 + scale * 0.1));
  o.connect(og); og.connect(_sfxBus);
  o.start(t); o.stop(t + 0.6);
}

export function dock() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  // Rising fifth chime.
  const notes = [62, 67, 74];   // D / G / D8va
  for (let i = 0; i < notes.length; i++) {
    const o = _ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = _hzFromMidi(notes[i]);
    const g = _envGain(t + i * 0.08, 0.01, 0.05, 0.5, 0.18);
    o.connect(g); g.connect(_sfxBus);
    o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.6);
  }
}

export function undock() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const n = _ctx.createBufferSource();
  n.buffer = _noiseBuf;
  const f = _ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.setValueAtTime(800, t);
  f.frequency.exponentialRampToValueAtTime(2000, t + 0.4);
  const g = _envGain(t, 0.05, 0.05, 0.4, 0.25);
  n.connect(f); f.connect(g); g.connect(_sfxBus);
  n.start(t); n.stop(t + 0.55);
}

export function jumpStart() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  // 1-second rising chord with sweeping filter.
  const root = 50;
  const chord = [root, root + 7, root + 12, root + 19];
  for (const m of chord) {
    const o = _ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(_hzFromMidi(m) * 0.5, t);
    o.frequency.exponentialRampToValueAtTime(_hzFromMidi(m) * 1, t + 1.0);
    const f = _ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(150, t);
    f.frequency.exponentialRampToValueAtTime(2500, t + 1.0);
    const g = _envGain(t, 0.05, 0.4, 0.55, 0.18);
    o.connect(f); f.connect(g); g.connect(_sfxBus);
    o.start(t); o.stop(t + 1.05);
  }
}

export function jumpEnd() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  // Whoosh + impact.
  const n = _ctx.createBufferSource();
  n.buffer = _noiseBuf;
  const f = _ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(3000, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 0.8);
  const g = _envGain(t, 0.005, 0.05, 0.7, 0.55);
  n.connect(f); f.connect(g); g.connect(_sfxBus);
  n.start(t); n.stop(t + 0.85);
  const o = _ctx.createOscillator();
  o.type = 'sine'; o.frequency.value = 60;
  const og = _envGain(t, 0.002, 0.1, 0.4, 0.45);
  o.connect(og); og.connect(_sfxBus);
  o.start(t); o.stop(t + 0.55);
}

export function trade() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const o = _ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(1500, t + 0.06);
  const g = _envGain(t, 0.002, 0.01, 0.12, 0.18);
  o.connect(g); g.connect(_sfxBus);
  o.start(t); o.stop(t + 0.16);
}

// ---------- Continuous: warning beep ----------

export function startWarning() {
  if (!_ctx || _warning) return;
  const tick = 0.6;
  let next = _ctx.currentTime;
  const interval = setInterval(() => {
    if (!_warning) return;
    while (next < _ctx.currentTime + 0.4) {
      const o = _ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 480;
      const g = _envGain(next, 0.005, 0.05, 0.06, 0.22);
      o.connect(g); g.connect(_sfxBus);
      o.start(next); o.stop(next + 0.13);
      next += tick;
    }
  }, 200);
  _warning = { interval };
}
export function stopWarning() {
  if (_warning) { clearInterval(_warning.interval); _warning = null; }
}

// ---------- Continuous: engine ----------

export function startEngine() {
  if (!_ctx || _engine) return;
  const t = _ctx.currentTime;
  const src = _ctx.createBufferSource();
  src.buffer = _noiseBuf;
  src.loop = true;

  const filter = _ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 220;
  filter.Q.value = 0.6;

  // Sub-rumble layer.
  const sub = _ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 55;
  const subGain = _ctx.createGain();
  subGain.gain.value = 0;

  const gain = _ctx.createGain();
  gain.gain.value = 0;

  src.connect(filter); filter.connect(gain);
  sub.connect(subGain); subGain.connect(gain);
  gain.connect(_sfxBus);

  src.start(t); sub.start(t);

  _engine = { src, sub, filter, gain, subGain, target: 0 };
}
export function updateEngine(throttleNorm, boost) {
  if (!_engine) return;
  // throttleNorm: 0..~1.5 (over-1 in boost). Filter freq + gain track throttle.
  const now = _ctx.currentTime;
  const tt = Math.max(0, Math.min(1.6, throttleNorm));
  const targetGain = 0.05 + tt * 0.18;
  const targetFilter = 200 + tt * 600 + (boost > 1.5 ? 350 : 0);
  const targetSub = 0.05 + tt * 0.10 + (boost > 1.5 ? 0.05 : 0);
  _engine.gain.gain.setTargetAtTime(targetGain, now, 0.08);
  _engine.filter.frequency.setTargetAtTime(targetFilter, now, 0.1);
  _engine.subGain.gain.setTargetAtTime(targetSub, now, 0.12);
}
export function stopEngine() {
  if (!_engine) return;
  const now = _ctx.currentTime;
  _engine.gain.gain.cancelScheduledValues(now);
  _engine.gain.gain.setTargetAtTime(0, now, 0.08);
  _engine.subGain.gain.setTargetAtTime(0, now, 0.08);
  const ref = _engine;
  setTimeout(() => {
    try { ref.src.stop(); ref.sub.stop(); } catch {}
  }, 400);
  _engine = null;
}

export function boostWhoosh() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const n = _ctx.createBufferSource();
  n.buffer = _noiseBuf;
  const f = _ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
  const g = _envGain(t, 0.005, 0.04, 0.35, 0.25);
  n.connect(f); f.connect(g); g.connect(_sfxBus);
  n.start(t); n.stop(t + 0.45);
}

// ---------- Continuous: mining laser ----------

export function startMining() {
  if (!_ctx || _mining) return;
  const t = _ctx.currentTime;
  const o = _ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 220;
  // FM: small wobble.
  const lfo = _ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 14;
  const lfoG = _ctx.createGain();
  lfoG.gain.value = 8;
  lfo.connect(lfoG); lfoG.connect(o.frequency);

  const filter = _ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  filter.Q.value = 4;

  const g = _ctx.createGain();
  g.gain.value = 0;
  o.connect(filter); filter.connect(g); g.connect(_sfxBus);
  o.start(t); lfo.start(t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.04);
  _mining = { o, lfo, g };
}
export function stopMining() {
  if (!_mining) return;
  const now = _ctx.currentTime;
  _mining.g.gain.cancelScheduledValues(now);
  _mining.g.gain.linearRampToValueAtTime(0, now + 0.1);
  const ref = _mining;
  setTimeout(() => { try { ref.o.stop(); ref.lfo.stop(); } catch {} }, 200);
  _mining = null;
}

// ---------- Generative ambient soundtrack ----------
//
// A slow chord progression in A minor, played as a lowpassed pad with a sub
// drone and occasional bell flourish. Scheduled with a 0.5s look-ahead so
// timing stays solid even under main-thread pressure.

const _PROG = [
  [57, 60, 64, 67],   // Am7
  [55, 60, 64, 67],   // G/A (subtle)
  [53, 57, 60, 65],   // F maj
  [50, 57, 60, 65],   // Dm7
  [55, 59, 62, 67],   // G
  [57, 60, 64, 67]    // Am7
];

export function startMusic() {
  if (!_ctx || _music) return;
  const bpm = 56;
  const beat = 60 / bpm;
  const measure = beat * 4;          // one chord per measure
  _music = {
    nextTime: _ctx.currentTime + 0.2,
    measureIdx: 0,
    interval: null,
    bpm, beat, measure
  };

  // Sustained low drone (root A1) for grounding.
  const dRoot = _ctx.createOscillator();
  dRoot.type = 'triangle';
  dRoot.frequency.value = _hzFromMidi(33);   // A1
  const dFilt = _ctx.createBiquadFilter();
  dFilt.type = 'lowpass';
  dFilt.frequency.value = 350;
  const dGain = _ctx.createGain();
  dGain.gain.value = 0;
  dRoot.connect(dFilt); dFilt.connect(dGain); dGain.connect(_musicBus);
  dRoot.start();
  dGain.gain.linearRampToValueAtTime(0.18, _ctx.currentTime + 4);
  _music.drone = { dRoot, dGain };

  _music.interval = setInterval(_scheduleMusic, 200);
  _scheduleMusic();
}
export function stopMusic() {
  if (!_music) return;
  if (_music.interval) clearInterval(_music.interval);
  if (_music.drone) {
    const now = _ctx.currentTime;
    _music.drone.dGain.gain.cancelScheduledValues(now);
    _music.drone.dGain.gain.linearRampToValueAtTime(0, now + 1.5);
    const ref = _music.drone;
    setTimeout(() => { try { ref.dRoot.stop(); } catch {} }, 1700);
  }
  _music = null;
}

function _scheduleMusic() {
  if (!_music) return;
  const lookahead = _ctx.currentTime + 0.6;
  while (_music.nextTime < lookahead) {
    const chord = _PROG[_music.measureIdx % _PROG.length];
    _voicePad(chord, _music.nextTime, _music.measure);
    _voiceSub(chord[0] - 12, _music.nextTime, _music.measure);
    if (Math.random() < 0.6) {
      _voiceBell(chord[Math.floor(Math.random() * chord.length)] + 12,
                 _music.nextTime + Math.random() * _music.measure * 0.7);
    }
    _music.nextTime += _music.measure;
    _music.measureIdx++;
  }
}

function _voicePad(notes, when, dur) {
  for (const m of notes) {
    const a = _ctx.createOscillator();
    const b = _ctx.createOscillator();
    a.type = 'sawtooth'; b.type = 'sawtooth';
    a.frequency.value = _hzFromMidi(m);
    b.frequency.value = _hzFromMidi(m) * 1.005;
    const f = _ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, when);
    f.frequency.linearRampToValueAtTime(1400, when + dur * 0.5);
    f.frequency.linearRampToValueAtTime(700, when + dur);
    f.Q.value = 1.5;
    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.045, when + 1.2);
    g.gain.linearRampToValueAtTime(0.030, when + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, when + dur + 0.1);
    a.connect(f); b.connect(f); f.connect(g); g.connect(_musicBus);
    a.start(when); b.start(when);
    a.stop(when + dur + 0.2); b.stop(when + dur + 0.2);
  }
}
function _voiceSub(midi, when, dur) {
  const o = _ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = _hzFromMidi(midi);
  const g = _ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.08, when + 0.6);
  g.gain.linearRampToValueAtTime(0, when + dur + 0.1);
  o.connect(g); g.connect(_musicBus);
  o.start(when); o.stop(when + dur + 0.2);
}
function _voiceBell(midi, when) {
  const car = _ctx.createOscillator();
  const mod = _ctx.createOscillator();
  const modGain = _ctx.createGain();
  car.type = 'sine'; mod.type = 'sine';
  car.frequency.value = _hzFromMidi(midi);
  mod.frequency.value = _hzFromMidi(midi) * 2.01;
  modGain.gain.setValueAtTime(_hzFromMidi(midi) * 1.2, when);
  modGain.gain.exponentialRampToValueAtTime(1, when + 1.2);
  mod.connect(modGain); modGain.connect(car.frequency);
  const g = _ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.07, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 1.4);
  car.connect(g); g.connect(_musicBus);
  car.start(when); mod.start(when);
  car.stop(when + 1.5); mod.stop(when + 1.5);
}
