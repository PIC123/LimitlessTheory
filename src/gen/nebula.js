import * as THREE from 'three';

// Procedural cubemap nebula. LT used an IFS shader (gen/nebula). We bake six canvas
// faces with fbm + a hot star direction, which gives the same flavor (color, banding,
// star glow) at a fraction of the complexity, and is compatible with scene.background
// + scene.environment.
export function buildNebulaSkybox(rng, starDir) {
  const SIZE = 512;
  const baseHue = rng.getUniform();
  const accentHue = (baseHue + 0.3 + rng.getUniform() * 0.4) % 1;
  const baseColor = new THREE.Color().setHSL(baseHue, 0.65, 0.45);
  const accentColor = new THREE.Color().setHSL(accentHue, 0.75, 0.55);
  const darkColor = new THREE.Color().setHSL(baseHue, 0.6, 0.05);
  const seed = rng.getUniform() * 1000;
  const seed2 = rng.getUniform() * 1000;

  const faces = [];
  const dirs = [
    { axis: 'px', face: faceVec('px') },
    { axis: 'nx', face: faceVec('nx') },
    { axis: 'py', face: faceVec('py') },
    { axis: 'ny', face: faceVec('ny') },
    { axis: 'pz', face: faceVec('pz') },
    { axis: 'nz', face: faceVec('nz') }
  ];
  for (const d of dirs) {
    faces.push(bakeFace(SIZE, d.axis, baseColor, accentColor, darkColor, starDir, seed, seed2));
  }
  const cube = new THREE.CubeTexture(faces);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  return cube;
}

function faceVec(axis) {
  switch (axis) {
    case 'px': return { right: [0,0,-1], up: [0,-1,0], forward: [1,0,0] };
    case 'nx': return { right: [0,0,1],  up: [0,-1,0], forward: [-1,0,0] };
    case 'py': return { right: [1,0,0],  up: [0,0,1],  forward: [0,1,0] };
    case 'ny': return { right: [1,0,0],  up: [0,0,-1], forward: [0,-1,0] };
    case 'pz': return { right: [1,0,0],  up: [0,-1,0], forward: [0,0,1] };
    case 'nz': return { right: [-1,0,0], up: [0,-1,0], forward: [0,0,-1] };
  }
}

function bakeFace(size, axis, baseColor, accentColor, darkColor, starDir, seed, seed2) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const f = faceVec(axis);
  const sx = new THREE.Vector3().fromArray(f.right);
  const sy = new THREE.Vector3().fromArray(f.up);
  const sz = new THREE.Vector3().fromArray(f.forward);
  const dir = new THREE.Vector3();
  const tmp = new THREE.Color();
  const star = starDir.clone().normalize();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 2 - 1;
      const v = (y / size) * 2 - 1;
      dir.set(0,0,0).addScaledVector(sx, u).addScaledVector(sy, v).add(sz).normalize();

      // Background: faint base + accent gradient.
      const n1 = fbm(dir.x * 1.5 + seed, dir.y * 1.5, dir.z * 1.5 + seed, 5);
      const n2 = fbm(dir.x * 4.0 + seed2, dir.y * 4.0 + seed2, dir.z * 4.0, 4);
      const cloud = Math.pow(n1, 1.8);
      const accent = Math.pow(Math.max(0, n2 - 0.4), 1.5);

      tmp.copy(darkColor)
        .lerp(baseColor, cloud * 0.8)
        .lerp(accentColor, accent * 0.7);

      // Stars
      const stars = starField(dir.x, dir.y, dir.z);
      tmp.r += stars; tmp.g += stars; tmp.b += stars;

      // Hot bloom toward the star direction.
      const dotS = Math.max(0, dir.dot(star));
      const bloom = Math.pow(dotS, 80) * 1.4;
      tmp.r += bloom; tmp.g += bloom * 0.85; tmp.b += bloom * 0.65;

      // Tonemap clamp.
      tmp.r = Math.min(1, Math.max(0, tmp.r));
      tmp.g = Math.min(1, Math.max(0, tmp.g));
      tmp.b = Math.min(1, Math.max(0, tmp.b));

      const i4 = (y * size + x) * 4;
      img.data[i4]   = (tmp.r * 255) | 0;
      img.data[i4+1] = (tmp.g * 255) | 0;
      img.data[i4+2] = (tmp.b * 255) | 0;
      img.data[i4+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
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
function starField(x, y, z) {
  const h = hash3(x * 80, y * 80, z * 80);
  if (h > 0.9985) return Math.pow((h - 0.9985) / 0.0015, 0.5) * 2;
  return 0;
}
