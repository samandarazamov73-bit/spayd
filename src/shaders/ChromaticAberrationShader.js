// Хроматическая аберрация: разделение R/B каналов вдоль радиуса.
// Усиливается к краям. На максимуме — для кульминации.

export const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAmount:  { value: 0.0015 },   // базовое смещение (UV-юниты)
    uPower:   { value: 1.6 }       // степень нарастания к краям
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    uniform float uPower;
    varying vec2 vUv;

    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c);
      vec2 dir = (r > 0.0) ? c / r : vec2(0.0);
      float falloff = pow(r, uPower);

      vec2 offset = dir * uAmount * falloff;

      float rC = texture2D(tDiffuse, vUv + offset).r;
      float gC = texture2D(tDiffuse, vUv).g;
      float bC = texture2D(tDiffuse, vUv - offset).b;
      float aC = texture2D(tDiffuse, vUv).a;

      gl_FragColor = vec4(rC, gC, bC, aC);
    }
  `
};
