// Виньетка с регулируемой интенсивностью и мягкостью.
// На максимальной интенсивности затемнение уходит вглубь — для финального акта.

export const VignetteShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uIntensity: { value: 0.55 },   // 0..1.5
    uSmoothness:{ value: 0.55 },   // 0..1
    uOffset:    { value: 0.6 }     // радиус начала затемнения
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
    uniform float uIntensity;
    uniform float uSmoothness;
    uniform float uOffset;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 d = vUv - vec2(0.5);
      d.x *= 1.7;                 // лёгкая горизонтальная растяжка
      float dist = length(d);
      float v = smoothstep(uOffset, uOffset - uSmoothness, dist);
      v = mix(1.0, v, clamp(uIntensity, 0.0, 1.5));
      color.rgb *= v;
      gl_FragColor = color;
    }
  `
};
