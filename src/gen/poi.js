import * as THREE from 'three';

// Procedural POI meshes used both on planet surfaces and as derelict
// space ruins. Each generator returns a Three.Group ready to drop into
// the scene; the caller positions it.
//
// Style: low-poly geometric, slightly weathered. Rotation jitter is
// applied so two ruins built from the same seed don't read identical.

const ROCK_MAT = new THREE.MeshStandardMaterial({
  color: 0x787065, roughness: 0.92, metalness: 0.05, flatShading: true
});
const METAL_MAT = new THREE.MeshStandardMaterial({
  color: 0x4d5460, roughness: 0.6, metalness: 0.85
});
const ACCENT_MAT = new THREE.MeshStandardMaterial({
  color: 0x00e7ff, emissive: 0x00e7ff, emissiveIntensity: 1.5,
  roughness: 0.4, metalness: 0
});
const RUST_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e4232, roughness: 0.95, metalness: 0.2, flatShading: true
});

// ---- Ancient ruins (large stone structures) -------------------------
export function buildRuinsMesh(rng, opts = {}) {
  const root = new THREE.Group();
  const pillars = 6 + rng.getInt(0, 6);
  const radius = 14 + rng.getUniform() * 8;

  // Central altar.
  const altar = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 5, 3, 8),
    ROCK_MAT
  );
  altar.position.y = 1.5;
  root.add(altar);

  // Glowing core that hints at the loot.
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 1),
    ACCENT_MAT
  );
  core.position.y = 4;
  core.userData.isCore = true;
  root.add(core);

  // Ring of broken pillars.
  for (let i = 0; i < pillars; i++) {
    const a = (i / pillars) * Math.PI * 2 + rng.getUniform() * 0.1;
    const r = radius + (rng.getUniform() - 0.5) * 4;
    const h = 6 + rng.getUniform() * 8;
    const broken = rng.getUniform() < 0.45;
    const pH = broken ? h * (0.2 + rng.getUniform() * 0.5) : h;
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(2 + rng.getUniform() * 1.5, pH, 2 + rng.getUniform() * 1.5),
      ROCK_MAT
    );
    pillar.position.set(Math.cos(a) * r, pH / 2, Math.sin(a) * r);
    pillar.rotation.y = rng.getUniform() * 0.3;
    if (broken) pillar.rotation.z = (rng.getUniform() - 0.5) * 0.3;
    root.add(pillar);

    // Some pillars carry a lintel to a neighbor.
    if (!broken && rng.getUniform() < 0.4 && i > 0) {
      const a2 = ((i - 1) / pillars) * Math.PI * 2;
      const r2 = radius;
      const x1 = Math.cos(a) * r, z1 = Math.sin(a) * r;
      const x2 = Math.cos(a2) * r2, z2 = Math.sin(a2) * r2;
      const lx = (x1 + x2) / 2, lz = (z1 + z2) / 2;
      const len = Math.hypot(x1 - x2, z1 - z2);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 1.6), ROCK_MAT);
      lintel.position.set(lx, h - 0.5, lz);
      lintel.lookAt(new THREE.Vector3(x2, h - 0.5, z2));
      root.add(lintel);
    }
  }

  // Worn floor tiles.
  const tile = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 2, radius + 2, 0.6, 24),
    ROCK_MAT
  );
  tile.position.y = 0.3;
  root.add(tile);

  // Glyph-strip on the altar (bloom-friendly).
  const glyph = new THREE.Mesh(
    new THREE.BoxGeometry(8.4, 0.05, 0.05),
    ACCENT_MAT
  );
  glyph.position.set(0, 2.6, 0);
  root.add(glyph);

  root.userData.kind = 'ruin';
  root.userData.radius = radius + 6;
  return root;
}

// ---- Outpost (functional base) --------------------------------------
export function buildOutpostMesh(rng) {
  const root = new THREE.Group();

  // Main hab.
  const hab = new THREE.Mesh(
    new THREE.BoxGeometry(14, 7, 18),
    METAL_MAT
  );
  hab.position.y = 3.5;
  root.add(hab);

  // Roof.
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(15, 0.6, 19),
    new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.7, metalness: 0.6 })
  );
  roof.position.y = 7.3;
  root.add(roof);

  // Side dome.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    METAL_MAT
  );
  dome.position.set(8.5, 0.5, 0);
  root.add(dome);

  // Antenna mast.
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.4, 12, 6),
    METAL_MAT
  );
  mast.position.set(-6, 7, -7);
  root.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), ACCENT_MAT);
  beacon.position.set(-6, 13, -7);
  beacon.userData.isBeacon = true;
  root.add(beacon);

  // Landing pad.
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.4, 24),
    new THREE.MeshStandardMaterial({ color: 0x222a36, roughness: 0.8, metalness: 0.4 })
  );
  pad.position.set(-12, 0.2, 6);
  root.add(pad);
  const padRing = new THREE.Mesh(
    new THREE.TorusGeometry(7.5, 0.15, 4, 32),
    ACCENT_MAT
  );
  padRing.rotation.x = Math.PI / 2;
  padRing.position.set(-12, 0.45, 6);
  root.add(padRing);

  // Window strip glow.
  const windows = new THREE.Mesh(
    new THREE.BoxGeometry(13, 0.8, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xffd23d, emissive: 0xffd23d, emissiveIntensity: 1.6,
      roughness: 0.4, metalness: 0
    })
  );
  windows.position.set(0, 4.2, 9.05);
  root.add(windows);

  root.userData.kind = 'outpost';
  root.userData.radius = 22;
  return root;
}

// ---- Derelict (space ruin) ------------------------------------------
export function buildDerelictMesh(rng) {
  const root = new THREE.Group();

  // Snapped capital-ship spine.
  const len = 60 + rng.getUniform() * 40;
  const spine = new THREE.Mesh(
    new THREE.BoxGeometry(len, 12, 14),
    RUST_MAT
  );
  root.add(spine);

  // Snapped-off nose section, offset and rotated to look broken.
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(7, 18, 6),
    RUST_MAT
  );
  nose.rotation.z = Math.PI / 2;
  nose.position.set(len / 2 + 4, -1, 1);
  nose.rotation.x = (rng.getUniform() - 0.5) * 0.4;
  nose.rotation.y = (rng.getUniform() - 0.5) * 0.4;
  root.add(nose);

  // Tear in the spine.
  const tear = new THREE.Mesh(
    new THREE.BoxGeometry(6, 13, 16),
    new THREE.MeshStandardMaterial({ color: 0x10120e, roughness: 0.9, metalness: 0.3 })
  );
  tear.position.x = -10 + (rng.getUniform() - 0.5) * 8;
  root.add(tear);

  // Engine cone (cold).
  const engine = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 6, 12, 8),
    METAL_MAT
  );
  engine.rotation.z = Math.PI / 2;
  engine.position.x = -len / 2 - 6;
  root.add(engine);

  // Drifting debris orbs around the wreck.
  for (let i = 0; i < 8; i++) {
    const a = rng.getUniform() * Math.PI * 2;
    const r = 22 + rng.getUniform() * 30;
    const debris = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.6 + rng.getUniform() * 1.6, 0),
      RUST_MAT
    );
    debris.position.set(Math.cos(a) * r, (rng.getUniform() - 0.5) * 14, Math.sin(a) * r);
    root.add(debris);
  }

  // A single glowing access hatch — the loot beacon.
  const beacon = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.7, 1),
    ACCENT_MAT
  );
  beacon.position.set(0, 7, 0);
  beacon.userData.isBeacon = true;
  root.add(beacon);

  root.userData.kind = 'derelict';
  root.userData.radius = len / 2 + 30;
  return root;
}
