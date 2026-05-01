import * as THREE from 'three';

// Jump gate visual: a glowing toroidal ring with a "shimmering" inner disc.
// The ring + inner glow are bloom-friendly so they pop on the bloom pass.
export function buildJumpGateMesh() {
  const root = new THREE.Group();

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x102230, roughness: 0.4, metalness: 0.85
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(140, 14, 16, 48), ringMat);
  root.add(ring);

  const accentColor = new THREE.Color(0x00e7ff);
  const glowMat = new THREE.MeshBasicMaterial({
    color: accentColor, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const glow = new THREE.Mesh(new THREE.TorusGeometry(140, 3.0, 8, 64), glowMat);
  root.add(glow);

  // Inner disc shimmer (a flat additive disc).
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(120, 48),
    new THREE.MeshBasicMaterial({
      color: 0x0080a0, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    })
  );
  disc.rotation.y = Math.PI / 2; // face along +X by default
  root.add(disc);

  // Accent struts.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const strut = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 8), ringMat);
    strut.position.set(Math.cos(a) * 160, Math.sin(a) * 160, 0);
    root.add(strut);
  }

  root.userData.discMat = disc.material;
  root.userData.glowMat = glowMat;
  return root;
}
