import * as THREE from 'three';

// Procedural station mesh: a ringed hub with radial spokes and a habitat block.
// Echoes LT's parametric station feel without trying to recreate its full Joint/Module system.
export function buildStationMesh(rng) {
  const root = new THREE.Group();
  const accent = new THREE.Color().setHSL(rng.getUniform(), 0.5, 0.55);
  const hullCol = new THREE.Color(0x6c7a87);

  const hullMat = new THREE.MeshStandardMaterial({ color: hullCol, roughness: 0.7, metalness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 1.5,
    roughness: 0.4, metalness: 0.1
  });

  // Central hub.
  const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(60, 0), hullMat);
  root.add(hub);

  // Spokes.
  const spokeCount = 4 + rng.getInt(0, 3);
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2;
    const len = 80 + rng.getUniform() * 60;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(8, 8, len), hullMat);
    spoke.position.set(Math.cos(a) * (len/2 + 30), 0, Math.sin(a) * (len/2 + 30));
    spoke.lookAt(0, 0, 0);
    root.add(spoke);

    // End modules.
    const module = new THREE.Mesh(new THREE.BoxGeometry(40, 30, 40), hullMat);
    module.position.set(Math.cos(a) * (len + 30), 0, Math.sin(a) * (len + 30));
    root.add(module);
  }

  // Outer ring.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(160, 8, 12, 64),
    hullMat
  );
  ring.rotation.x = Math.PI / 2;
  root.add(ring);

  // Accent lights along the ring.
  const ringLights = new THREE.Mesh(
    new THREE.TorusGeometry(160, 1.6, 6, 96),
    accentMat
  );
  ringLights.rotation.x = Math.PI / 2;
  root.add(ringLights);

  // Top antenna.
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 80, 6), hullMat);
  antenna.position.y = 70;
  root.add(antenna);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), accentMat);
  beacon.position.y = 110;
  root.add(beacon);

  root.userData.spinSpeed = (rng.getUniform() - 0.5) * 0.15;
  root.scale.setScalar(0.8 + rng.getUniform() * 0.4);
  return root;
}
