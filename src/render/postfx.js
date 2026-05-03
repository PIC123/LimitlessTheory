import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Composer with RenderPass + UnrealBloom. Bloom is intentionally tight and
// thresholded so it only catches genuine emissives (engine glow, star, bolts,
// station accents, POI beacons) — not mid-gray station hulls or sunlit terrain.
//
// UnrealBloomPass(resolution, strength, radius, threshold)
//   strength  — total bloom intensity
//   radius    — softness/spread
//   threshold — luminance below which pixels don't contribute. Anything in
//               linear-light space below this is left alone.
export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const w = renderer.domElement.clientWidth || window.innerWidth;
  const h = renderer.domElement.clientHeight || window.innerHeight;
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.78);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());
  return { composer, bloom };
}
