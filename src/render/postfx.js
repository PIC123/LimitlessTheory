import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createLTPostFX } from './ltPostFX.js';

// Composer = RenderPass → UnrealBloom → LT-style post (replaces OutputPass).
//
// The final LT pass owns tonemap + color grading + vignette + chromatic
// aberration + dither + linear→sRGB conversion. Set
// renderer.toneMapping = NoToneMapping when using this composer.
//
// Bloom params follow LT's "subtle but always present" philosophy: a
// medium threshold so only emissive-dominant pixels glow, paired with a
// healthy strength so the glow itself is visible. Mid-bright surfaces
// (sunlit terrain, station hulls) stay clear; the star, engines, bolts,
// gates, and POI beacons all get warm halos.
export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const w = renderer.domElement.clientWidth || window.innerWidth;
  const h = renderer.domElement.clientHeight || window.innerHeight;
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.85, 0.7, 0.72);
  composer.addPass(bloom);

  const ltPost = createLTPostFX();
  ltPost.renderToScreen = true;
  composer.addPass(ltPost);

  return { composer, bloom, ltPost };
}
