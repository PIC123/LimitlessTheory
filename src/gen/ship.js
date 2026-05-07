import * as THREE from 'three';

// Parametric ship generator. Inspired by LT's Gen.ShipFighter / Gen.ShipLib parametric
// shape pipeline (hull + wings + greebles + sockets).
//
// Customizable parameters:
//   role         : 'fighter' | 'sleek' | 'heavy' | 'trader' | 'patrol' | 'player'
//                  — drives base proportions (length × width × height multipliers)
//   size         : visual scale, default 6
//   accent       : engine glow / accent strip color (default cyan)
//   hullColor    : hull base color (default randomized cool gray)
//   trimColor    : panel trim color (default near-black)
//   cockpitColor : canopy tint (default deep navy)
//   variant      : numeric seed offset so re-rolling with same role gives diff hulls
export function buildShipMesh(rng, opts = {}) {
  const role = opts.role || 'fighter';
  const size = opts.size || 6;
  const accentColor = new THREE.Color(opts.accent != null ? opts.accent : 0x00e7ff);

  // Role drives base proportions. The randomized noise on top still applies
  // so two "sleek" ships look related but not identical.
  const ROLE = {
    fighter: { len: 1.00, w: 1.00, h: 1.00, wings: 2, glow: 1.0 },
    sleek:   { len: 1.45, w: 0.65, h: 0.65, wings: 2, glow: 1.2 },
    heavy:   { len: 0.95, w: 1.30, h: 1.25, wings: 2, glow: 0.9 },
    trader:  { len: 1.60, w: 1.40, h: 1.00, wings: 0, glow: 0.85 },
    patrol:  { len: 1.10, w: 0.95, h: 0.90, wings: 2, glow: 1.0 },
    player:  { len: 1.10, w: 1.00, h: 1.00, wings: 2, glow: 1.0 }
  };
  const r = ROLE[role] || ROLE.fighter;

  const root = new THREE.Group();

  const hullColor = opts.hullColor != null
    ? new THREE.Color(opts.hullColor)
    : new THREE.Color().setHSL(rng.getUniform(), 0.05, 0.35);
  const trimColor = opts.trimColor != null
    ? new THREE.Color(opts.trimColor)
    : new THREE.Color(0x1a2230);
  const cockpitColor = opts.cockpitColor != null
    ? new THREE.Color(opts.cockpitColor)
    : new THREE.Color(0x00121a);

  const hullMat = new THREE.MeshStandardMaterial({
    color: hullColor,
    roughness: 0.55, metalness: 0.7,
    flatShading: true
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: trimColor, roughness: 0.4, metalness: 0.85
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 2.5 * r.glow,
    roughness: 0.3, metalness: 0.0
  });

  // ---- Hull ----
  const hullLen = (1.0 + rng.getUniform() * 0.6) * r.len;
  const hullW = (0.55 + rng.getUniform() * 0.3) * r.w;
  const hullH = (0.35 + rng.getUniform() * 0.2) * r.h;

  const hullGeo = role === 'trader'
    ? new THREE.CylinderGeometry(hullW, hullW * 0.7, hullLen * 2.6, 7, 1)
    : new THREE.IcosahedronGeometry(hullW, 1);
  if (role !== 'trader') {
    const pos = hullGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.x *= hullLen * 1.4;
      v.y *= hullH;
      // Stretch nose to a point.
      if (v.x > 0.3) v.x *= 1.2;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    hullGeo.computeVertexNormals();
  } else {
    hullGeo.rotateZ(Math.PI / 2);
  }
  const hull = new THREE.Mesh(hullGeo, hullMat);
  root.add(hull);

  // ---- Cockpit / canopy ----
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: cockpitColor, emissive: accentColor, emissiveIntensity: 0.4,
      roughness: 0.2, metalness: 0.7
    })
  );
  cockpit.position.set(hullLen * 0.3, hullH * 0.55, 0);
  cockpit.scale.set(0.8, 0.7, 0.55);
  root.add(cockpit);

  // ---- Wings (mirrored) ----
  const wingCount = r.wings;
  for (let i = 0; i < wingCount; i++) {
    const sign = i === 0 ? 1 : -1;
    const wingGeo = new THREE.BoxGeometry(0.7 + rng.getUniform() * 0.4, 0.06, 0.5 + rng.getUniform() * 0.3);
    const wing = new THREE.Mesh(wingGeo, hullMat);
    wing.position.set(-0.1, 0, sign * (hullW + 0.3));
    wing.rotation.x = sign * (rng.getUniform() * 0.2);
    wing.rotation.z = sign * 0.05;
    root.add(wing);

    // Wingtip thruster pod.
    const pod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.6, 8),
      trimMat
    );
    pod.rotation.z = Math.PI / 2;
    pod.position.set(-0.25, 0, sign * (hullW + 0.55 + rng.getUniform() * 0.3));
    root.add(pod);

    // Wing-mounted weapon hardpoint.
    if (role !== 'trader') {
      const gun = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.4, 6),
        trimMat
      );
      gun.rotation.z = Math.PI / 2;
      gun.position.set(0.4, 0, sign * (hullW + 0.35));
      root.add(gun);
    }
  }

  // ---- Engine glow at the rear ----
  const engineCount = role === 'trader' ? 3 : 2;
  const engineGroup = new THREE.Group();
  for (let i = 0; i < engineCount; i++) {
    const z = engineCount === 1 ? 0 : -hullW * 0.6 + i * (hullW * 1.2 / (engineCount - 1));
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 8),
      new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.position.set(-hullLen * 0.95, 0, z);
    engineGroup.add(glow);
  }
  root.add(engineGroup);
  root.userData.engineGroup = engineGroup;
  root.userData.engineColor = accentColor.clone();

  // ---- Greebles / extra detail ----
  const greebleCount = 4 + rng.getInt(0, 4);
  for (let i = 0; i < greebleCount; i++) {
    const g = new THREE.Mesh(
      new THREE.BoxGeometry(0.05 + rng.getUniform() * 0.18, 0.05 + rng.getUniform() * 0.1, 0.05 + rng.getUniform() * 0.18),
      trimMat
    );
    const t = rng.getUniform();
    g.position.set(-hullLen * 0.4 + t * hullLen * 0.8,
                   (rng.getUniform() - 0.5) * hullH * 1.3,
                   (rng.getUniform() - 0.5) * (hullW * 1.4));
    root.add(g);
  }

  // ---- Accent strip (running light) ----
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(hullLen * 1.6, 0.02, 0.04),
    accentMat
  );
  strip.position.set(0, hullH * 0.1, hullW * 0.7);
  root.add(strip);
  const strip2 = strip.clone();
  strip2.position.z = -hullW * 0.7;
  root.add(strip2);

  root.scale.setScalar(size);
  // LT-style "forward" is +X. Models built around X+ forward, so lookAt works after rotating to face -Z.
  // Three.js convention: forward = -Z. Compensate with a parent rotation.
  const wrapper = new THREE.Group();
  wrapper.add(root);
  root.rotation.y = -Math.PI / 2;
  wrapper.userData.engineGroup = engineGroup;
  wrapper.userData.engineColor = accentColor.clone();
  return wrapper;
}
