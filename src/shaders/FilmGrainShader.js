// Зерно плёнки: мягкий шум, имитирующий ISO/screen noise.
// Реалистичная луминесцентная модуляция (тёмные участки шумят сильнее).

export const FilmGrainShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uTime:     { value: 0.0 },
    uAmount:   { value: 0.06 },
    uSize:     { value: 1.4 }
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
    uniform float uTime;
    uniform float uAmount;
    uniform float uSize;
    varying vec2 vUv;

    // hash13 — gpu-safe pseudorandom
    float hash13(vec3 p) {
      p  = fract(p * 0.1031);
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float n = hash13(vec3(vUv * (800.0 / uSize), uTime * 60.0));
      n = (n - 0.5) * 2.0;

      // тёмные участки шумят сильнее — характерная плёночная подача
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float darkBoost = mix(1.4, 0.6, smoothstep(0.0, 0.6, lum));

      color.rgb += n * uAmount * darkBoost;
      gl_FragColor = color;
    }
  `
};
