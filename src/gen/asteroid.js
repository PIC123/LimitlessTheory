import * as THREE from 'three';

// Procedural asteroid: deformed icosphere, mirroring LT's idea of an irregular minable rock.
// The final mesh is unit-scale; callers position/scale it.
export function buildAsteroidMesh(rng, scale) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seed = rng.getUniform() * 1000;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Multi-octave noise via cheap trig hashing.
    const n = noise3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6) * 0.55
            + noise3(v.x * 3.4, v.y * 3.4 + seed, v.z * 3.4) * 0.25
            + noise3(v.x * 6.7, v.y * 6.7, v.z * 6.7 + seed) * 0.12;
    v.multiplyScalar(0.85 + n * 0.55);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  const tint = 0.25 + rng.getUniform() * 0.4;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint * 0.9, tint * 0.85, tint * 0.78),
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(scale);
  return mesh;
}

function noise3(x, y, z) {
  // Very cheap pseudo-noise; deterministic on (x,y,z).
  return (
    Math.sin(x * 1.7 + y * 2.3 + z * 0.9) * 0.5 +
    Math.sin(x * 0.5 - y * 1.1 + z * 2.6) * 0.3 +
    Math.sin(x * 3.1 + y * 0.7 - z * 1.4) * 0.2
  ) * 0.5;
}
