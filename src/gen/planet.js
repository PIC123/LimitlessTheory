import * as THREE from 'three';

// A procedural planet: noisy color ramp painted to a canvas, then mapped to a sphere.
// Echoes LT's planet stub — they had a planet entity, we expand it with a baked surface.
export function buildPlanetMesh(rng) {
  const tex = bakePlanetTexture(rng);
  const geo = new THREE.SphereGeometry(1200, 96, 64);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.92, metalness: 0.02
  });
  const mesh = new THREE.Mesh(geo, mat);

  // Atmosphere shell.
  const atmoMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(rng.getUniform(), 0.6, 0.7),
    transparent: true, opacity: 0.15, side: THREE.BackSide,
    depthWrite: false
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1260, 64, 32), atmoMat);
  mesh.add(atmo);
  return mesh;
}

function bakePlanetTexture(rng) {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // Base color
  const baseHue = rng.getUniform();
  const land = new THREE.Color().setHSL(baseHue, 0.5, 0.45);
  const sea  = new THREE.Color().setHSL((baseHue + 0.5) % 1, 0.6, 0.25);
  const ice  = new THREE.Color().setHSL(0.55, 0.05, 0.92);
  const seaLevel = 0.42 + rng.getUniform() * 0.2;

  const img = ctx.createImageData(w, h);
  const seedX = rng.getUniform() * 1000;
  const seedY = rng.getUniform() * 1000;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const lat = (v - 0.5) * Math.PI;            // -pi/2..pi/2
      const lon = u * Math.PI * 2;                // 0..2pi
      // Convert to spherical xyz then sample noise.
      const sx = Math.cos(lat) * Math.cos(lon);
      const sy = Math.sin(lat);
      const sz = Math.cos(lat) * Math.sin(lon);
      const n = fbm(sx * 1.7 + seedX, sy * 1.7, sz * 1.7 + seedY, 5);
      let col;
      if (n < seaLevel) {
        const t = n / seaLevel;
        col = sea.clone().lerp(land, t * 0.5);
      } else {
        const t = (n - seaLevel) / (1 - seaLevel);
        col = land.clone().lerp(new THREE.Color(0xffffff).multiplyScalar(0.8), t * 0.5);
      }
      // Polar ice caps.
      const polar = Math.max(0, Math.abs(v - 0.5) * 2 - 0.7) / 0.3;
      col.lerp(ice, polar);
      const i4 = (y * w + x) * 4;
      img.data[i4]   = (col.r * 255) | 0;
      img.data[i4+1] = (col.g * 255) | 0;
      img.data[i4+2] = (col.b * 255) | 0;
      img.data[i4+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildStarMesh(rng) {
  const color = new THREE.Color().setHSL(0.05 + rng.getUniform() * 0.1, 0.85, 0.7);
  const mat = new THREE.MeshBasicMaterial({ color, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);

  // Glow billboard.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialGlow(color),
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false
  }));
  glow.scale.set(2400, 2400, 1);
  mesh.add(glow);

  mesh.userData.isStar = true;
  return mesh;
}

function makeRadialGlow(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, `rgba(${(color.r*255)|0},${(color.g*255)|0},${(color.b*255)|0},1)`);
  g.addColorStop(0.4, `rgba(${(color.r*255)|0},${(color.g*255)|0},${(color.b*255)|0},0.35)`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf), w = zf*zf*(3-2*zf);
  const n000 = hash3(xi, yi, zi),     n100 = hash3(xi+1, yi, zi);
  const n010 = hash3(xi, yi+1, zi),   n110 = hash3(xi+1, yi+1, zi);
  const n001 = hash3(xi, yi, zi+1),   n101 = hash3(xi+1, yi, zi+1);
  const n011 = hash3(xi, yi+1, zi+1), n111 = hash3(xi+1, yi+1, zi+1);
  const x00 = n000 + (n100 - n000) * u;
  const x10 = n010 + (n110 - n010) * u;
  const x01 = n001 + (n101 - n001) * u;
  const x11 = n011 + (n111 - n011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
function fbm(x, y, z, oct) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise3(x*freq, y*freq, z*freq);
    norm += amp;
    amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}
