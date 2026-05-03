import * as THREE from 'three';

// Procedural terrain patch for planet surfaces.
//
// We sample fbm noise per vertex to displace a PlaneGeometry in Y.
// The result is a 2km x 2km terrain mesh with biome-driven coloring.
// Vertex colors are baked from height + slope so we don't need texture
// assets. Roughness comes from the same noise so dunes look matte and
// rocky highlands look slightly more reflective.

export const TERRAIN_SIZE = 2000;
export const TERRAIN_SEGMENTS = 160; // ~25 k vertices, fine for a single patch

export function buildTerrainMesh(rng, biome) {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const seedA = rng.getUniform() * 1000;
  const seedB = rng.getUniform() * 1000;
  const cfg = biomeConfig(biome);

  // Heightmap pass.
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = x / TERRAIN_SIZE;
    const v = z / TERRAIN_SIZE;
    let h = fbm(u * cfg.lowFreq + seedA, v * cfg.lowFreq, 5);
    h = h * cfg.lowAmp + ridge(u * cfg.midFreq, v * cfg.midFreq + seedB) * cfg.midAmp;
    h += fbm(u * cfg.highFreq, v * cfg.highFreq, 3) * cfg.highAmp;
    h *= cfg.amp;
    heights[i] = h;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();

  // Vertex colors keyed off height + slope.
  const colors = new Float32Array(pos.count * 3);
  const normalAttr = geo.attributes.normal;
  const palette = cfg.palette;
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = heights[i];
    const ny = normalAttr.getY(i);
    const slope = 1 - Math.max(0, ny);

    // Layer 1: height tier.
    const tier = Math.max(0, Math.min(1, (h - cfg.tierLow) / (cfg.tierHigh - cfg.tierLow)));
    tmp.copy(palette.low).lerp(palette.mid, Math.min(1, tier * 1.4));
    if (tier > 0.6) tmp.lerp(palette.high, (tier - 0.6) / 0.4);

    // Layer 2: cliff slopes lerp toward the cliff color.
    if (slope > 0.4) {
      const k = Math.min(1, (slope - 0.4) / 0.5);
      tmp.lerp(palette.cliff, k * 0.9);
    }

    // Per-vertex micro variation so it doesn't read as banded.
    const j = (Math.sin(pos.getX(i) * 0.13 + pos.getZ(i) * 0.21) * 0.5 + 0.5) * 0.07;
    tmp.r = Math.min(1, Math.max(0, tmp.r + j));
    tmp.g = Math.min(1, Math.max(0, tmp.g + j));
    tmp.b = Math.min(1, Math.max(0, tmp.b + j));
    colors[i * 3]     = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: cfg.roughness,
    metalness: 0.05,
    flatShading: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.biome = biome;
  mesh.userData.heights = heights;
  return mesh;
}

// Sample the bilinear height at a world (x, z) on a terrain mesh built above.
export function sampleHeight(mesh, x, z) {
  const heights = mesh.userData.heights;
  if (!heights) return 0;
  const half = TERRAIN_SIZE / 2;
  const u = (x + half) / TERRAIN_SIZE;
  const v = (z + half) / TERRAIN_SIZE;
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const segs = TERRAIN_SEGMENTS;
  const fx = u * segs;
  const fz = v * segs;
  const ix = Math.min(segs - 1, Math.floor(fx));
  const iz = Math.min(segs - 1, Math.floor(fz));
  const tx = fx - ix;
  const tz = fz - iz;
  const w = segs + 1;
  const i00 = iz * w + ix;
  const i10 = iz * w + (ix + 1);
  const i01 = (iz + 1) * w + ix;
  const i11 = (iz + 1) * w + (ix + 1);
  const h0 = heights[i00] * (1 - tx) + heights[i10] * tx;
  const h1 = heights[i01] * (1 - tx) + heights[i11] * tx;
  return h0 * (1 - tz) + h1 * tz;
}

// Sky-dome shader: vertical gradient between zenith and horizon, with a soft
// sun glow at the star's direction. We use a BackSide sphere so it always
// renders behind everything and doesn't clip on terrain edges.
export function buildSkyDome(biome) {
  const cfg = biomeConfig(biome);
  const geo = new THREE.SphereGeometry(8000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(cfg.horizon) },
      uZenith:  { value: new THREE.Color(cfg.zenith) },
      uSunDir:  { value: new THREE.Vector3(0.6, 0.5, 0.3).normalize() },
      uSunColor:{ value: new THREE.Color(cfg.sun) }
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      void main() {
        float t = clamp(vDir.y, -0.2, 1.0);
        vec3 base = mix(uHorizon, uZenith, smoothstep(0.0, 0.7, t));
        float sun = max(0.0, dot(normalize(vDir), normalize(uSunDir)));
        // Tight sun disk (high exponent, modest gain) + small halo. Pre-bloom
        // these stay in mid-bright range; post-threshold bloom only nudges the
        // sun core, not the whole sky.
        vec3 sky = base + uSunColor * pow(sun, 180.0) * 0.85;
        sky += uSunColor * pow(sun, 10.0) * 0.08;
        gl_FragColor = vec4(sky, 1.0);
      }
    `
  });
  return new THREE.Mesh(geo, mat);
}

// ---------- Biome config ----------
function biomeConfig(biome) {
  // For chunk 1 we ship a single biome; biomeConfig() is keyed so chunk 2
  // can add 'forest', 'ice', 'lava', 'ocean' without restructuring.
  const desert = {
    amp: 90,
    lowFreq: 1.6, lowAmp: 0.75,
    midFreq: 4.0, midAmp: 0.20,
    highFreq: 12.0, highAmp: 0.05,
    tierLow: -10, tierHigh: 60,
    roughness: 0.95,
    palette: {
      low:   new THREE.Color('#6f4e2d'),
      mid:   new THREE.Color('#b88a4f'),
      high:  new THREE.Color('#f0d49a'),
      cliff: new THREE.Color('#3e2818')
    },
    horizon: '#f0c177',
    zenith:  '#8a4d2a',
    sun:     '#ffd9a3'
  };
  switch (biome) {
    default: return desert;
  }
}

// ---------- Noise ----------
function hash2(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const n00 = hash2(xi, yi),     n10 = hash2(xi+1, yi);
  const n01 = hash2(xi, yi+1),   n11 = hash2(xi+1, yi+1);
  const x0 = n00 + (n10 - n00) * u;
  const x1 = n01 + (n11 - n01) * u;
  return x0 + (x1 - x0) * v;
}
function fbm(x, y, oct) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise2(x*freq, y*freq);
    norm += amp;
    amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}
function ridge(x, y) {
  const n = noise2(x, y);
  return 1 - Math.abs(n * 2 - 1);
}
