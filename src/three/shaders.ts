// GLSL 着色器集合：深空星云 / 等离子主脑 / 智能体能量体 / 护盾 / 光带 / 故障特效

export const NEBULA_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const NEBULA_FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uTime;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float v = 0.0, a = 0.52;
  mat3 rot = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
  for (int i = 0; i < 6; i++) {
    v += a * noise3(p);
    p = rot * p * 2.03 + vec3(0.17, 0.31, 0.13);
    a *= 0.5;
  }
  return v;
}
float starLayer(vec3 d, float scale, float threshold) {
  vec3 p = d * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  float rnd = hash31(id);
  vec3 offset = vec3(hash31(id + 11.7), hash31(id + 27.1), hash31(id + 43.9)) - 0.5;
  float dist = length(f - offset * 0.72);
  float aa = max(fwidth(dist), 0.0015);
  float star = (1.0 - smoothstep(0.072 - aa, 0.072 + aa, dist)) * step(threshold, rnd);
  float core = (1.0 - smoothstep(0.020 - aa, 0.020 + aa, dist)) * step(threshold, rnd);
  return star * 0.24 + core * 0.88;
}
void main() {
  vec3 d = normalize(vDir);
  float slow = uTime * 0.002;
  float large = fbm(d * 2.15 + vec3(slow, 0.0, 0.0));
  float warp = fbm(d * 4.1 + large * 1.8);
  float fine = fbm(d * 10.5 + warp * 2.2);
  float dust = fbm(d * 22.0 + fine);
  float micro = noise3(d * 96.0 + warp * 5.0);

  float cloud = smoothstep(0.40, 0.77, large * 0.62 + warp * 0.48);
  float ridge = pow(clamp(1.0 - abs(fine * 2.0 - 1.0), 0.0, 1.0), 5.0);
  float darkLane = smoothstep(0.36, 0.64, fbm(d * 5.3 + vec3(4.2, 1.7, 8.3)));

  vec3 deep = vec3(0.003, 0.006, 0.016);
  vec3 violet = vec3(0.070, 0.022, 0.115);
  vec3 blue = vec3(0.012, 0.075, 0.115);
  vec3 teal = vec3(0.010, 0.135, 0.145);
  vec3 col = deep;
  col += violet * cloud * (0.30 + dust * 0.70);
  col += blue * smoothstep(0.48, 0.78, warp) * 0.72;
  col += teal * ridge * cloud * (1.0 - darkLane * 0.74) * 0.72;
  col *= (0.48 + darkLane * 0.52) * (0.94 + micro * 0.12);
  col += mix(blue, teal, 0.55) * pow(micro, 3.0) * cloud * 0.15;

  // 少量低亮度背景星，避免星云层与实体星点叠加后晃眼。
  col *= 0.46;
  float starsA = starLayer(d, 165.0, 0.982);
  float starsB = starLayer(d + 3.7, 285.0, 0.992);
  float starsC = starLayer(d - 8.2, 430.0, 0.996);
  float twinkle = 0.96 + 0.04 * sin(uTime * 0.45 + hash31(floor(d * 165.0)) * 40.0);
  col += vec3(0.56, 0.76, 1.0) * starsA * twinkle * 0.72;
  col += vec3(0.82, 0.94, 1.0) * starsB * 0.62;
  col += vec3(0.65, 0.88, 0.92) * starsC * 0.38;
  gl_FragColor = vec4(col, 1.0);
}
`

// 等离子能量核心：顶点位移 + 明暗体积 + 表面电弧 + Fresnel 边缘光
export const PLASMA_VERT = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
varying float vNoise;

vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
void main() {
  float n = snoise(position * 0.62 + vec3(uTime * 0.24));
  float detail = snoise(position * 1.7 - vec3(uTime * 0.15)) * 0.22;
  float amp = 0.10 + uIntensity * 0.42;
  vec3 displaced = position + normal * (n + detail) * amp;
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vPos = displaced;
  vNoise = n + detail;
  gl_Position = projectionMatrix * mv;
}
`

export const PLASMA_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
varying float vNoise;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(vView);
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);
  float key = max(dot(n, normalize(vec3(-0.45, 0.80, 0.55))), 0.0);
  float fill = max(dot(n, normalize(vec3(0.65, -0.15, -0.45))), 0.0);
  float flow = sin(vPos.y * 5.2 + vPos.x * 2.3 - uTime * 2.1 + vNoise * 5.0);
  float arc = pow(clamp(1.0 - abs(flow), 0.0, 1.0), 15.0);
  float filament = pow(clamp(1.0 - abs(sin(vPos.z * 7.0 + vNoise * 4.0 + uTime * 1.3)), 0.0, 1.0), 24.0);
  float cellular = 0.5 + 0.5 * sin(vNoise * 8.0 + vPos.y * 2.0);
  vec3 col = uColor * (0.12 + key * 0.46 + fill * 0.12 + cellular * 0.12);
  col += uColor * fres * (0.72 + uIntensity * 0.48);
  col += mix(uColor, vec3(0.72, 1.0, 0.96), 0.72) * arc * (0.65 + uIntensity * 0.55);
  col += vec3(0.35, 0.85, 1.0) * filament * 0.34;
  gl_FragColor = vec4(col, 1.0);
}
`

// 智能体能量体：比主脑更凝聚，保留球体明暗与表面能量回路
export const ENERGY_VERT = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
  float wave = sin(position.y * 3.4 + uTime * 1.5) * sin(position.x * 2.7 - uTime) * 0.035 * (0.4 + uIntensity);
  vec3 p = position + normal * wave;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vPos = p;
  gl_Position = projectionMatrix * mv;
}
`

export const ENERGY_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uDenied;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
  vec3 n = normalize(vNormal);
  float ndv = max(dot(n, normalize(vView)), 0.0);
  float rim = pow(1.0 - ndv, 2.1);
  float key = max(dot(n, normalize(vec3(-0.5, 0.85, 0.45))), 0.0);
  float back = max(dot(n, normalize(vec3(0.6, -0.2, -0.5))), 0.0);
  float longitude = atan(vPos.z, vPos.x);
  float circuitA = pow(clamp(1.0 - abs(sin(vPos.y * 8.0 + sin(longitude * 5.0) - uTime * 1.5)), 0.0, 1.0), 20.0);
  float circuitB = pow(clamp(1.0 - abs(sin(longitude * 7.0 + vPos.y * 3.0 + uTime * 0.8)), 0.0, 1.0), 28.0);
  float microCircuit = pow(clamp(1.0 - abs(sin(vPos.x * 29.0 + vPos.y * 23.0 + longitude * 3.0)), 0.0, 1.0), 36.0);
  float surfaceGrain = 0.5 + 0.5 * sin(vPos.x * 43.0 + sin(vPos.y * 37.0) + vPos.z * 31.0);
  vec3 base = mix(uColor, vec3(0.18, 0.005, 0.008), uDenied);
  vec3 col = base * (0.14 + key * 0.55 + back * 0.10 + surfaceGrain * 0.055);
  col += base * rim * (0.85 + uIntensity * 0.55);
  col += mix(base, vec3(1.0), 0.65) * (circuitA * 0.58 + circuitB * 0.24 + microCircuit * 0.10) * (1.0 - uDenied * 0.8);
  vec3 lightDir = normalize(vec3(-0.5, 0.85, 0.45));
  float spec = pow(max(dot(reflect(-lightDir, n), normalize(vView)), 0.0), 64.0);
  float softSpec = pow(max(dot(reflect(-lightDir, n), normalize(vView)), 0.0), 12.0);
  col += vec3(0.75, 0.95, 1.0) * (spec * 0.72 + softSpec * 0.075);
  gl_FragColor = vec4(col, 1.0);
}
`

// 数据主干：沿圆柱 UV 流动的亮脉冲，端部自然衰减
export const FLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const FLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float endFade = pow(sin(vUv.y * 3.14159265), 0.45);
  float phase = vUv.y * 28.0 - uTime * (3.0 + uIntensity * 5.0) + sin(vUv.x * 6.28318) * 0.8;
  float packet = pow(max(0.0, sin(phase)), 18.0);
  float filament = pow(max(0.0, sin(vUv.y * 80.0 - uTime * 8.0)), 40.0);
  float alpha = endFade * (0.10 + uIntensity * 0.16 + packet * 0.56 + filament * 0.18);
  vec3 col = uColor * (0.45 + uIntensity * 0.55);
  col += mix(uColor, vec3(0.85, 0.98, 1.0), 0.75) * packet * 1.25;
  gl_FragColor = vec4(col, alpha);
}
`

// 待确认护盾：琥珀色 Fresnel 气泡 + 扫描线
export const SHIELD_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vPos = position;
  gl_Position = projectionMatrix * mv;
}
`

export const SHIELD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
  float pulse = 0.68 + 0.32 * sin(uTime * 3.5);
  float scan = pow(max(0.0, sin(vPos.y * 14.0 - uTime * 4.0)), 24.0);
  gl_FragColor = vec4(uColor * (1.05 + scan * 0.55), (fres * pulse * 0.72 + scan * 0.10));
}
`

// 故障特效（终止进程时短暂触发）：横向撕裂 + RGB 色散
export const GLITCH_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uAmount;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  float band = step(0.996 - uAmount * 0.25, fract(uv.y * 24.0 + uTime * 7.0));
  uv.x += band * uAmount * 0.04 * sin(uTime * 90.0);
  float shift = uAmount * 0.009;
  vec4 cr = texture2D(tDiffuse, uv + vec2(shift, 0.0));
  vec4 cg = texture2D(tDiffuse, uv);
  vec4 cb = texture2D(tDiffuse, uv - vec2(shift, 0.0));
  gl_FragColor = vec4(cr.r, cg.g, cb.b, 1.0);
}
`

// 星点使用独立尺寸与相位，在高分屏下保留锐利星核和细微衍射光芒。
export const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vTwinkle;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vColor = color;
  vTwinkle = 0.96 + 0.04 * sin(uTime * 0.45 + aPhase);
  gl_PointSize = clamp(aSize * uPixelRatio * (165.0 / max(1.0, -mv.z)), 1.0, 7.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}
`

export const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vTwinkle;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p);
  float aa = max(fwidth(r), 0.008);
  float halo = 1.0 - smoothstep(0.16, 0.50, r);
  float core = 1.0 - smoothstep(0.065 - aa, 0.065 + aa, r);
  float rays = pow(max(0.0, 1.0 - abs(p.x) * 18.0), 5.0) * (1.0 - smoothstep(0.0, 0.48, abs(p.y)));
  rays += pow(max(0.0, 1.0 - abs(p.y) * 18.0), 5.0) * (1.0 - smoothstep(0.0, 0.48, abs(p.x)));
  float alpha = (halo * 0.24 + core * 0.82 + rays * 0.065) * vTwinkle;
  if (alpha < 0.015) discard;
  gl_FragColor = vec4(vColor * (0.60 + core * 1.12), alpha);
}
`

// 最终显示阶段的边缘自适应锐化：抑制光晕扩散，不把噪声一并放大。
export const PIXEL_POLISH_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexelSize;
uniform float uStrength;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 center = texture2D(tDiffuse, vUv).rgb;
  vec3 north = texture2D(tDiffuse, vUv + vec2(0.0, uTexelSize.y)).rgb;
  vec3 south = texture2D(tDiffuse, vUv - vec2(0.0, uTexelSize.y)).rgb;
  vec3 east = texture2D(tDiffuse, vUv + vec2(uTexelSize.x, 0.0)).rgb;
  vec3 west = texture2D(tDiffuse, vUv - vec2(uTexelSize.x, 0.0)).rgb;
  float lc = luma(center);
  float lo = min(lc, min(min(luma(north), luma(south)), min(luma(east), luma(west))));
  float hi = max(lc, max(max(luma(north), luma(south)), max(luma(east), luma(west))));
  float edge = smoothstep(0.018, 0.22, hi - lo);
  vec3 refined = center + (center * 4.0 - north - south - east - west) * uStrength * (0.20 + edge * 0.80);
  float minimum = min(0.0, lo - 0.055);
  float maximum = max(1.0, hi + 0.055);
  gl_FragColor = vec4(clamp(refined, vec3(minimum), vec3(maximum)), 1.0);
}
`
