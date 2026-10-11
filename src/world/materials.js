import * as THREE from 'three';

/**
 * Shared material factory. Everything in the world reuses these so draw calls
 * batch and shader compiles happen once.
 */

let gradientMap = null;
/** 4-step ramp: hard anime shading with a warm bounce term. */
export function getGradientMap() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([
    60, 60, 60,
    120, 118, 116,
    190, 186, 180,
    255, 252, 245,
  ]);
  gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RGBFormat);
  gradientMap.needsUpdate = true;
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  return gradientMap;
}

const windUniforms = [];

/** Register a material's wind uniform so one update drives every shader. */
export function registerWind(mat) {
  if (mat.userData.uWind) windUniforms.push(mat.userData.uWind);
  return mat;
}

export function updateWind(time, strength) {
  for (const u of windUniforms) {
    u.value.x = time;
    u.value.y = strength;
  }
}

/** Vertex-coloured lambert for terrain and static props. */
export function makeVertexMaterial({ flat = false, wind = 0, shadow = true } = {}) {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: flat, fog: true,
  });
  if (wind > 0) {
    mat.userData.uWind = { value: new THREE.Vector2(0, wind) };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = mat.userData.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec2 uWind;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 iPos = vec3(0.0);
          #endif
          float phase = iPos.x * 0.21 + iPos.z * 0.17;
          float w = sin(uWind.x * 1.35 + phase) * 0.7 + sin(uWind.x * 2.6 + phase * 1.7) * 0.3;
          float amp = max(transformed.y, 0.0) * uWind.y;
          transformed.x += w * amp * 0.055;
          transformed.z += w * amp * 0.035;`);
    };
    mat.customProgramCacheKey = () => `vcol-wind-${wind}`;
    registerWind(mat);
  }
  mat.castShadow = shadow;
  mat.receiveShadow = true;
  return mat;
}

/**
 * Toon material with a rim light in a spirit colour. Used for characters and
 * the fox: the rim is what sells "this thing is not entirely here".
 */
export function makeToonMaterial(color, {
  rim = new THREE.Color(0x8ad8ff), rimPower = 2.4, rimStrength = 0.7,
  emissive = new THREE.Color(0x000000), emissiveIntensity = 0, transparent = false, opacity = 1,
} = {}) {
  const mat = new THREE.MeshToonMaterial({
    color, gradientMap: getGradientMap(), emissive, emissiveIntensity, transparent, opacity,
  });
  mat.userData.uRim = { value: new THREE.Vector4(rim.r, rim.g, rim.b, rimStrength) };
  mat.userData.uRimPower = { value: rimPower };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = mat.userData.uRim;
    shader.uniforms.uRimPower = mat.userData.uRimPower;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec4 uRim;
        uniform float uRimPower;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float rimDot = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        float rim = pow(clamp(rimDot, 0.0, 1.0), uRimPower);
        gl_FragColor.rgb += uRim.rgb * rim * uRim.w;`);
  };
  mat.customProgramCacheKey = () => 'toon-rim';
  return mat;
}

/** Animated water: two sine layers, fresnel rim, fog-aware. */
export function makeWaterMaterial(color = 0x2e5a66, deep = 0x14343c) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uDeep: { value: new THREE.Color(deep) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.5) },
      uSunColor: { value: new THREE.Color(0xffd0a0) },
      fogColor: { value: new THREE.Color(0xa0b0b8) },
      fogDensity: { value: 0.0025 },
      uOpacity: { value: 0.88 },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      #include <fog_pars_vertex>
      float wave(vec2 p, float t) {
        return sin(p.x * 0.42 + t * 1.1) * 0.5
             + sin(p.y * 0.37 - t * 0.9) * 0.42
             + sin((p.x + p.y) * 0.23 + t * 1.6) * 0.22;
      }
      void main() {
        vec3 pos = position;
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        float w = wave(wp.xz, uTime);
        wp.y += w * 0.11;
        vWave = w;
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uDeep; uniform float uTime; uniform float uOpacity;
      uniform vec3 uSunDir; uniform vec3 uSunColor;
      varying vec3 vWorld; varying float vWave;
      #include <fog_pars_fragment>
      void main() {
        // cheap normal from the wave field
        float e = 0.6;
        float hx = sin((vWorld.x + e) * 0.42 + uTime * 1.1) * 0.5 - sin((vWorld.x - e) * 0.42 + uTime * 1.1) * 0.5;
        float hz = sin((vWorld.z + e) * 0.37 - uTime * 0.9) * 0.42 - sin((vWorld.z - e) * 0.37 - uTime * 0.9) * 0.42;
        vec3 n = normalize(vec3(-hx * 1.6, 1.0, -hz * 1.6));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = mix(uDeep, uColor, clamp(vWave * 0.5 + 0.5, 0.0, 1.0));
        col = mix(col, uColor * 1.5 + uSunColor * 0.25, fres * 0.9);
        vec3 h = normalize(uSunDir + v);
        col += uSunColor * pow(max(dot(n, h), 0.0), 90.0) * 1.4;
        float a = clamp(uOpacity + fres * 0.25, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }
    `,
    fog: true,
  });
  return mat;
}

/** Inverted-hull outline material for characters and key props. */
export function makeOutlineMaterial(color = 0x120c10, thickness = 0.03) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uThickness: { value: thickness } },
    vertexShader: /* glsl */`
      uniform float uThickness;
      void main() {
        vec3 p = position + normal * uThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: THREE.BackSide,
    depthWrite: true,
  });
  return mat;
}
