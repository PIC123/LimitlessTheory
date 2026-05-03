// LT-style final post-FX. Single fullscreen pass that performs (in order):
//   1. light radial chromatic aberration
//   2. linear → gamma (LT applies tonemap in gamma-encoded space, which is
//      what gives shadows their lift instead of crushing them)
//   3. multiplicative vignette (pre-tonemap so HDR can leak into corners)
//   4. exp-tonemap with variable contrast: 1 - exp(-k * pow(c, 1.25+c))
//   5. 3-point quadratic bezier grade with screen-space variation
//      (cool shadows, warm highlights — LT's split-tone)
//   6. 1/256 hashed noise dither to break banding
//
// Direct port of the formulas from
//   ltheory/res/shader/fragment/filter/{tonemap.glsl,aberration.glsl}.
// The bezier control points have been trimmed slightly so the look skews
// "neutral cinematic" rather than "deep teal-orange."
//
// NOTE: when this pass is in the chain, set renderer.toneMapping = NoToneMapping.
// We're owning tonemap + colorSpace conversion ourselves.

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const LTPostFXShader = {
  uniforms: {
    tDiffuse:           { value: null },
    uAberration:        { value: 0.0015 },
    uVignetteStrength:  { value: 0.30 },
    uVignetteHardness:  { value: 24.0 },
    uExposure:          { value: 1.0 },
    uTime:              { value: 0.0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uAberration;
    uniform float uVignetteStrength;
    uniform float uVignetteHardness;
    uniform float uExposure;
    uniform float uTime;

    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    // Linear → gamma-encoded sRGB (close enough to the spec; matches LT's gamma()).
    vec3 toGamma(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

    // 3-point quadratic Bezier per channel: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2,
    // with t = the input channel value in [0,1]. Screen-position offsets the control
    // points slightly so highlights skew warm and shadows skew cool.
    vec3 bezierGrade(vec3 c, vec2 uv) {
      vec3 p0 = vec3(0.16, 0.14 + 0.06 * uv.x, 0.22 - 0.08 * uv.y);
      vec3 p1 = vec3(0.45, 0.48 - 0.05 * uv.y, 0.50);
      vec3 p2 = vec3(0.92 + 0.05 * uv.y, 0.92, 0.88 - 0.10 * sqrt(uv.x * uv.y));
      vec3 t = clamp(c, 0.0, 1.0);
      vec3 omt = vec3(1.0) - t;
      return omt * omt * p0 + 2.0 * omt * t * p1 + t * t * p2;
    }

    void main() {
      // Radial chromatic aberration — RGB samples offset along the screen
      // diagonal from center, scaled by uAberration.
      vec2 dir = (vUv - 0.5) * uAberration;
      vec3 c = vec3(0.0);
      c.r = texture2D(tDiffuse, vUv + dir).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - dir).b;

      // Apply exposure in linear space.
      c *= uExposure;

      // Move into gamma-encoded space — LT applies tonemap here.
      c = toGamma(c);

      // Vignette pre-tonemap so HDR highlights leak into corners.
      vec2 uvp = vec2(1.0) - 2.0 * abs(vec2(0.5) - vUv);
      c *= 1.0 - uVignetteStrength * exp(-uVignetteHardness * uvp.x);
      c *= 1.0 - uVignetteStrength * exp(-uVignetteHardness * uvp.y);

      // LT exp tonemap with variable power. Highlights compressed harder
      // (1.25 + c => up to 2.25 for full white), shadows lifted gently.
      const float k = 2.30;
      c = vec3(1.0) - exp(-k * pow(max(c, 0.0), vec3(1.25) + c));

      // Bezier 3-point grade.
      c = bezierGrade(c, vUv);

      // 1/256 noise dither — a hashed pattern animated very slowly so the
      // dither doesn't look static.
      float n = fract(sin(dot(vUv * 1024.0 + uTime * 0.001, vec2(12.9898, 78.233))) * 43758.5453);
      c -= (n * 2.0 - 1.0) / 256.0;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `
};

export function createLTPostFX() {
  return new ShaderPass(LTPostFXShader);
}
