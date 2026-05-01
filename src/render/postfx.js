import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Composer with RenderPass + UnrealBloom. The bloom catches the engine glow,
// the star, the projectiles, and the station accent rings.
export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const w = renderer.domElement.clientWidth || window.innerWidth;
  const h = renderer.domElement.clientHeight || window.innerHeight;
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.85, 0.6, 0.0);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());
  return { composer, bloom };
}
