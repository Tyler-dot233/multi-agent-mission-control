import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import type { AgentGroup, Policy } from '@/types'
import { onSceneEvent, type SceneEvent } from '@/lib/sceneEvents'
import { describeWork, summarizeWork } from '@/lib/workLabel'
import { RENDER_QUALITY_PROFILES, type RenderQuality } from '@/lib/renderQuality'
import {
  NEBULA_VERT, NEBULA_FRAG, PLASMA_VERT, PLASMA_FRAG,
  ENERGY_VERT, ENERGY_FRAG, FLOW_VERT, FLOW_FRAG,
  SHIELD_VERT, SHIELD_FRAG, GLITCH_FRAG, STAR_VERT, STAR_FRAG, PIXEL_POLISH_FRAG,
} from '@/three/shaders'

/**
 * 赛博科幻 3D 信息流 · v2
 * 选择性辉光 / 彗星拖尾 / 热力色温 / 等离子主脑 / 三层纵深 / 电影相机 /
 * 子进程卫星环 / 审批状态可视化 / 事件驱动物理反馈
 */

interface Satellite {
  sprite: THREE.Sprite
  angle: number
  radius: number
  incline: number
  speed: number
  intensity: number
  targetIntensity: number
}

interface Trunk {
  curve: THREE.QuadraticBezierCurve3
  band: THREE.Mesh
  hitProxy: THREE.Mesh
  points: THREE.Points
  ghosts: THREE.Points
  geom: THREE.BufferGeometry
  ghostGeom: THREE.BufferGeometry
  ts: Float32Array
  count: number
  intensity: number
}

interface NodeState {
  agentId: string
  group: THREE.Group
  core: THREE.Mesh
  shell: THREE.Mesh
  aura: THREE.Sprite
  label: CSS2DObject
  hue: number
  angle: number
  spawnAt: number
  satellites: Map<number, Satellite>
  orbit: THREE.LineLoop
  shield: THREE.Mesh
  beacon: THREE.Mesh
  trunk: Trunk
  denied: boolean
}

interface Fx {
  obj: THREE.Object3D
  born: number
  life: number
  kind: 'beam' | 'burst' | 'wave'
  opacity?: number
  velocities?: Float32Array
  geom?: THREE.BufferGeometry
}

function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return Math.round((h * 137.508) % 360)
}

/** 热力色温：冰蓝 → 青 → 琥珀 → 炽红 */
function heatColor(i: number, out = new THREE.Color()): THREE.Color {
  const stops: [number, number][] = [[210, 0], [172, 0.35], [42, 0.65], [0, 1]]
  for (let k = 0; k < stops.length - 1; k++) {
    const [h0, t0] = stops[k]
    const [h1, t1] = stops[k + 1]
    if (i <= t1) return out.setHSL((h0 + ((h1 - h0) * (i - t0)) / (t1 - t0)) / 360, 1, 0.6)
  }
  return out.setHSL(0, 1, 0.6)
}

function glowTexture(): THREE.Texture {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.055, 'rgba(255,255,255,0.98)')
  grad.addColorStop(0.16, 'rgba(255,255,255,0.72)')
  grad.addColorStop(0.38, 'rgba(255,255,255,0.20)')
  grad.addColorStop(0.72, 'rgba(255,255,255,0.035)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(c)
  texture.name = 'high-resolution-energy-sprite'
  return texture
}

function makePoints(count: number, sprite: THREE.Texture, size: number): { points: THREE.Points; geom: THREE.BufferGeometry } {
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  const mat = new THREE.PointsMaterial({
    size, map: sprite, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geom, mat)
  points.frustumCulled = false
  return { points, geom }
}

export function FlowField3D({ groups, policies, orbitSpeed = 1, quality = 'ultra' }: { groups: AgentGroup[]; policies: Record<string, Policy>; orbitSpeed?: number; quality?: RenderQuality }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const groupsRef = useRef(groups)
  const policiesRef = useRef(policies)
  const orbitSpeedRef = useRef(orbitSpeed)
  const qualityRef = useRef(quality)
  const resizeRef = useRef<(() => void) | null>(null)
  useEffect(() => { groupsRef.current = groups }, [groups])
  useEffect(() => { policiesRef.current = policies }, [policies])
  useEffect(() => { orbitSpeedRef.current = orbitSpeed }, [orbitSpeed])
  useEffect(() => {
    qualityRef.current = quality
    resizeRef.current?.()
  }, [quality])
  const [failed, setFailed] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number; width: number; text: string[] } | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    } catch {
      // WebGL 初始化失败时切换到静态降级提示。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true)
      return
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.info.autoReset = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const now = () => performance.now() / 1000
    let seed = 0x6d2b79f5
    const rand = () => {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x04070d)
    scene.fog = new THREE.FogExp2(0x04070d, 0.004)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600)
    const CAM_END = new THREE.Vector3(0, 30, 58)
    camera.position.set(0, 70, 155) // 电影式推进起点

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.maxDistance = 140
    controls.minDistance = 14
    controls.autoRotate = false
    controls.autoRotateSpeed = 0.45
    controls.target.set(0, 6, 0)
    controls.enabled = false

    // HDR 场景 → 辉光 → 故障 → SMAA → 色调映射 → 像素级细节锐化。
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.18, 1.0)
    composer.addPass(bloom)
    const glitch = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: GLITCH_FRAG,
    })
    composer.addPass(glitch)
    const smaa = new SMAAPass()
    composer.addPass(smaa)
    composer.addPass(new OutputPass())
    const polish = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uStrength: { value: RENDER_QUALITY_PROFILES[qualityRef.current].sharpen },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: PIXEL_POLISH_FRAG,
    })
    composer.addPass(polish)
    let glitchAmount = 0

    const labelRenderer = new CSS2DRenderer()
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.inset = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'
    wrap.appendChild(renderer.domElement)
    wrap.appendChild(labelRenderer.domElement)

    const sprite = glowTexture()

    // ── 背景层：星云穹顶 ──
    const nebulaMat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERT, fragmentShader: NEBULA_FRAG,
      uniforms: { uTime: { value: 0 } }, side: THREE.BackSide, depthWrite: false, fog: false,
    })
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(280, 96, 64), nebulaMat))

    // 真实三维星点：独立尺寸、相位与像素导数抗锯齿，避免低分辨率光斑。
    const starUniforms = { uTime: { value: 0 }, uPixelRatio: { value: 1 } }
    const starCount = 720
    {
      const pos = new Float32Array(starCount * 3)
      const colors = new Float32Array(starCount * 3)
      const sizes = new Float32Array(starCount)
      const phases = new Float32Array(starCount)
      const palette = [new THREE.Color(0x9fc8ff), new THREE.Color(0xe8f5ff), new THREE.Color(0x83fff0), new THREE.Color(0xffe1b0)]
      for (let i = 0; i < starCount; i++) {
        const y = rand() * 2 - 1
        const a = rand() * Math.PI * 2
        const r = 95 + rand() * 135
        const s = Math.sqrt(1 - y * y)
        pos[i * 3] = Math.cos(a) * s * r
        pos[i * 3 + 1] = y * r
        pos[i * 3 + 2] = Math.sin(a) * s * r
        const c = palette[Math.floor(rand() * palette.length)].clone().multiplyScalar(0.38 + rand() * 0.68)
        colors[i * 3] = c.r
        colors[i * 3 + 1] = c.g
        colors[i * 3 + 2] = c.b
        sizes[i] = 0.65 + Math.pow(rand(), 2.2) * 1.55
        phases[i] = rand() * Math.PI * 2
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
      g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
      const m = new THREE.ShaderMaterial({
        vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: starUniforms,
        vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      })
      const stars = new THREE.Points(g, m)
      stars.frustumCulled = false
      scene.add(stars)
    }

    // ── 前景层：漂浮尘埃（视差纵深）──
    {
      const n = 110
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (rand() - 0.5) * 90
        pos[i * 3 + 1] = rand() * 40 - 5
        pos[i * 3 + 2] = (rand() - 0.5) * 90
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const m = new THREE.PointsMaterial({ size: 0.55, map: sprite, color: 0x2a5a66, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })
      const dust = new THREE.Points(g, m)
      dust.frustumCulled = false
      scene.add(dust)
    }

    // ── 中景：极坐标地面 ──
    const polar = new THREE.PolarGridHelper(38, 12, 8, 128, 0x0e3a3a, 0x0a2028)
    ;(polar.material as THREE.Material).transparent = true
    ;(polar.material as THREE.Material).opacity = 0.25
    scene.add(polar)

    // ── 中央主脑：等离子核心 ──
    const core = new THREE.Group()
    core.position.y = 6
    const plasmaMat = new THREE.ShaderMaterial({
      vertexShader: PLASMA_VERT, fragmentShader: PLASMA_FRAG,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0.5 }, uColor: { value: new THREE.Color(0x18e0c8) } },
    })
    const coreInner = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 6), plasmaMat)
    const coreShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4.6, 3),
      new THREE.MeshBasicMaterial({ color: 0x18e0c8, wireframe: true, transparent: true, opacity: 0.16 }),
    )
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: 0x18e0c8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }))
    halo.scale.setScalar(22)
    core.add(coreInner, coreShell, halo)
    const rings: THREE.Mesh[] = []
    ;[7.5, 9.5, 11.5].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.055, 16, 256),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(i === 1 ? 0x2affd8 : 0x0f8f80).multiplyScalar(1.15), transparent: true, opacity: 0.50 - i * 0.1 }),
      )
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.22
      rings.push(ring)
      core.add(ring)
    })
    scene.add(core)
    const coreLabelEl = document.createElement('div')
    coreLabelEl.className = 'flow3d-label flow3d-label-core'
    const coreLabel = new CSS2DObject(coreLabelEl)
    coreLabel.position.set(0, 8.6, 0)
    core.add(coreLabel)

    const nodes = new Map<string, NodeState>()
    const agentRoot = new THREE.Group()
    scene.add(agentRoot)
    const fxList: Fx[] = []

    // ── 事件视觉反馈 ──
    const spawnBeam = (to: THREE.Vector3, color: THREE.Color) => {
      const from = core.position.clone()
      const dir = to.clone().sub(from)
      const len = dir.length()
      const normal = dir.clone().normalize()
      const midpoint = from.clone().addScaledVector(dir, 0.5)
      // 外层能量辉光 + 内层高亮束芯，避免单根半透明圆柱的塑料感。
      ;[
        { radius: 0.34, opacity: 0.32, life: 1.05, tint: color.clone().multiplyScalar(1.7) },
        { radius: 0.065, opacity: 0.95, life: 0.72, tint: new THREE.Color(0xdfffff).multiplyScalar(1.8) },
      ].forEach((spec) => {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(spec.radius, spec.radius, len, 16, 1, true),
          new THREE.MeshBasicMaterial({ color: spec.tint, transparent: true, opacity: spec.opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        )
        beam.position.copy(midpoint)
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
        scene.add(beam)
        fxList.push({ obj: beam, born: now(), life: spec.life, kind: 'beam', opacity: spec.opacity })
      })
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: color.clone().multiplyScalar(1.6), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }))
      flash.position.copy(to)
      flash.scale.setScalar(3)
      flash.userData.baseScale = 3
      scene.add(flash)
      fxList.push({ obj: flash, born: now(), life: 0.55, kind: 'wave', opacity: 0.75 })
    }
    const spawnBurst = (at: THREE.Vector3, hue: number) => {
      const n = 46
      const { points, geom } = makePoints(n, sprite, 0.9)
      ;(points.material as THREE.PointsMaterial).color = new THREE.Color(`hsl(${hue}, 100%, 62%)`).multiplyScalar(2.0)
      const vel = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        geom.getAttribute('position').setXYZ(i, at.x, at.y, at.z)
        const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1), sp = 6 + rand() * 14
        vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp
        vel[i * 3 + 1] = Math.cos(ph) * sp
        vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp
      }
      scene.add(points)
      fxList.push({ obj: points, born: now(), life: 1.3, kind: 'burst', velocities: vel, geom })
      // 冲击波环
      const wave = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 1.85, 48),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(`hsl(${hue}, 100%, 65%)`).multiplyScalar(1.8), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      )
      wave.position.copy(at)
      wave.rotation.x = -Math.PI / 2
      scene.add(wave)
      fxList.push({ obj: wave, born: now(), life: 1.0, kind: 'wave' })
    }

    const offEvent = onSceneEvent((e: SceneEvent) => {
      if (e.type === 'kill') glitchAmount = 1
      if (e.type === 'alert') glitchAmount = 0.22
      const ns = e.agentId ? nodes.get(e.agentId) : undefined
      const at = ns ? ns.group.position.clone() : core.position.clone()
      const hue = ns ? ns.hue : 172
      if (e.type === 'approve' || e.type === 'focus') spawnBeam(at, new THREE.Color(`hsl(${hue}, 100%, 65%)`))
      if (e.type === 'alert') spawnBeam(at, new THREE.Color(0xffa32b).multiplyScalar(1.3))
      if (e.type === 'kill') spawnBurst(at, hue)
    })

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2(-10, -10)
    const tmpColor = new THREE.Color()

    const syncScene = () => {
      const gs = groupsRef.current
      const seen = new Set<string>()
      // 竖屏/窄屏收紧星环，避免两侧智能体与标签出画。
      const radius = camera.aspect < 1.15 ? 14 : camera.aspect < 1.5 ? 20 : 24

      gs.forEach((g, gi) => {
        seen.add(g.agentId)
        const hue = hashHue(g.agentId)
        const baseColor = new THREE.Color(`hsl(${hue}, 95%, 60%)`)
        let ns = nodes.get(g.agentId)
        const angle = (gi / Math.max(gs.length, 3)) * Math.PI * 2 - Math.PI / 2
        const groupIntensity = g.cpu == null ? Math.min(1, g.memMB / 4096) : Math.min(1, g.cpu / 100)

        if (!ns) {
          const grp = new THREE.Group()
          const inner = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.5, 5),
            new THREE.ShaderMaterial({
              vertexShader: ENERGY_VERT, fragmentShader: ENERGY_FRAG,
              uniforms: {
                uColor: { value: baseColor.clone() }, uTime: { value: 0 },
                uIntensity: { value: groupIntensity }, uDenied: { value: 0 },
              },
            }),
          )
          const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 3), new THREE.MeshBasicMaterial({ color: baseColor, wireframe: true, transparent: true, opacity: 0.20 }))
          const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: baseColor, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending }))
          aura.scale.setScalar(6.4)
          inner.userData.agentId = g.agentId
          const el = document.createElement('div')
          el.className = 'flow3d-label'
          const label = new CSS2DObject(el)
          label.position.set(0, 3.8, 0)
          // 子进程轨道环
          const orbitPts: THREE.Vector3[] = []
          for (let i = 0; i <= 128; i++) orbitPts.push(new THREE.Vector3(Math.cos((i / 128) * Math.PI * 2) * 3.4, 0, Math.sin((i / 128) * Math.PI * 2) * 3.4))
          const orbit = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(orbitPts),
            new THREE.LineBasicMaterial({ color: baseColor, transparent: true, opacity: 0.22 }),
          )
          // 待确认护盾 + 信标
          const shield = new THREE.Mesh(
            new THREE.SphereGeometry(2.9, 64, 48),
            new THREE.ShaderMaterial({
              vertexShader: SHIELD_VERT, fragmentShader: SHIELD_FRAG,
              uniforms: { uColor: { value: new THREE.Color(0xffb830) }, uTime: { value: 0 } },
              transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            }),
          )
          const beacon = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.32, 10, 16, 1, true),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb830).multiplyScalar(1.6), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
          )
          beacon.position.y = 6.5
          // 聚合主干光带
          const band = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 1, 32, 1, true),
            new THREE.ShaderMaterial({
              vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG,
              uniforms: { uColor: { value: new THREE.Color(0x18e0c8) }, uTime: { value: 0 }, uIntensity: { value: 0 } },
              transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
            }),
          )
          scene.add(band)
          // 悬停热区：看不见的粗圆柱，包裹整条光带便于鼠标命中
          const hitProxy = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
            new THREE.MeshBasicMaterial({ visible: false }),
          )
          hitProxy.userData.agentId = g.agentId
          scene.add(hitProxy)
          const { points, geom } = makePoints(8, sprite, 0.7)
          const { points: ghosts, geom: ghostGeom } = makePoints(8, sprite, 0.4)
          scene.add(points, ghosts)
          const trunk: Trunk = {
            curve: new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()),
            band, hitProxy, points, ghosts, geom, ghostGeom, ts: new Float32Array(8), count: 8, intensity: 0,
          }
          for (let i = 0; i < 8; i++) trunk.ts[i] = rand()
          grp.add(inner, shell, aura, label, orbit, shield, beacon)
          agentRoot.add(grp)
          ns = { agentId: g.agentId, group: grp, core: inner, shell, aura, label, hue, angle, spawnAt: now(), satellites: new Map(), orbit, shield, beacon, trunk, denied: false }
          nodes.set(g.agentId, ns)
        }

        ns.angle = angle
        ns.group.position.set(Math.cos(angle) * radius, 5, Math.sin(angle) * radius)
        const policy = policiesRef.current[g.agentId]
        const pending = !policy
        ns.denied = policy?.decision === 'denied'
        ns.shield.visible = pending
        ns.beacon.visible = pending
        ;(ns.shell.material as THREE.MeshBasicMaterial).opacity = ns.denied ? 0.08 : 0.24
        const energyMat = ns.core.material as THREE.ShaderMaterial
        energyMat.uniforms.uColor.value.copy(baseColor)
        energyMat.uniforms.uDenied.value = ns.denied ? 1 : 0
        ;(ns.aura.material as THREE.SpriteMaterial).color.copy(ns.denied ? tmpColor.setHSL(0, 0.7, 0.2) : baseColor)
        ;(ns.orbit.material as THREE.LineBasicMaterial).opacity = ns.denied ? 0.06 : 0.22
        const cpuTxt = g.cpu == null ? '—' : `${g.cpu.toFixed(0)}%`
        const badge = pending ? '<i class="badge-pending">待确认</i>' : ns.denied ? '<i class="badge-denied">已拒绝</i>' : ''
        ;(ns.label.element as HTMLDivElement).innerHTML = `<b>${g.name}${badge}</b><span>${cpuTxt} · ${g.processes.length}进程</span>`
        ns.label.element.style.setProperty('--h', String(hue))

        // 子进程卫星：转速 = 该子进程强度
        const seenPids = new Set<number>()
        g.processes.forEach((p, pi) => {
          seenPids.add(p.pid)
          const intensity = p.cpu == null ? Math.min(1, p.memMB / 4096) : Math.min(1, p.cpu / 40)
          let sat = ns!.satellites.get(p.pid)
          if (!sat) {
            const sm = new THREE.SpriteMaterial({ map: sprite, color: heatColor(intensity).multiplyScalar(2.0), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending })
            const sp = new THREE.Sprite(sm)
            sp.scale.setScalar(0.55 + intensity * 0.5)
            ns!.group.add(sp)
            sat = {
              sprite: sp,
              angle: (pi / Math.max(g.processes.length, 1)) * Math.PI * 2,
              radius: 3.4 + (pi % 3) * 0.55,
              incline: ((pi % 5) - 2) * 0.18,
              speed: 0, intensity, targetIntensity: intensity,
            }
            ns!.satellites.set(p.pid, sat)
          }
          sat.targetIntensity = intensity
          ;(sat.sprite.material as THREE.SpriteMaterial).color.copy(heatColor(intensity).multiplyScalar(2.0))
        })
        for (const [pid, sat] of ns.satellites) {
          if (!seenPids.has(pid)) {
            ns.group.remove(sat.sprite)
            ns.satellites.delete(pid)
          }
        }

        // 主干曲线与粒子数随总算力伸缩
        const t = ns.trunk
        t.curve.v0.copy(ns.group.position)
        t.curve.v2.copy(core.position)
        t.curve.v1.copy(ns.group.position).lerp(core.position, 0.5).add(new THREE.Vector3(0, 7, 0))
        const want = 6 + Math.round(groupIntensity * 26)
        if (want !== t.count) {
          t.count = want
          t.ts = new Float32Array(want)
          for (let i = 0; i < want; i++) t.ts[i] = rand()
          t.geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(want * 3), 3))
          t.ghostGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(want * 3), 3))
        }
      })

      for (const [id, ns] of nodes) {
        if (!seen.has(id)) {
          agentRoot.remove(ns.group)
          scene.remove(ns.trunk.band, ns.trunk.hitProxy, ns.trunk.points, ns.trunk.ghosts)
          nodes.delete(id)
        }
      }
    }

    const onMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      const allNodes = [...nodes.values()]
      const hitCore = raycaster.intersectObjects(allNodes.map((n) => n.core), false)[0]
      const hitTrunk = hitCore ? undefined : raycaster.intersectObjects(allNodes.map((n) => n.trunk.hitProxy), false)[0]
      const hit = hitCore ?? hitTrunk
      if (hit) {
        const g = groupsRef.current.find((x) => x.agentId === hit.object.userData.agentId)
        if (g) {
          const top = [...g.processes].sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0)).slice(0, 5)
          const lines = hitCore
            ? [
                `${g.name} · ${g.vendor}`,
                `CPU ${g.cpu == null ? '—' : g.cpu.toFixed(1) + '%'} · 内存 ${g.memMB >= 1024 ? (g.memMB / 1024).toFixed(2) + ' GB' : g.memMB + ' MB'}`,
                ...top.map((p) => `#${p.pid} ${describeWork(p)} ${p.cpu == null ? '' : p.cpu.toFixed(1) + '%'} ${p.memMB}MB`),
              ]
            : [
                `${g.name} · 数据流`,
                `传输强度 ${Math.round((g.cpu == null ? Math.min(1, g.memMB / 4096) : Math.min(1, g.cpu / 100)) * 100)}%`,
                ...summarizeWork(g, 4).map(
                  (w) => `▸ ${w.label}${w.count > 1 ? ` ×${w.count}` : ''}${w.cpu != null ? ` · ${w.cpu.toFixed(1)}%` : ''}`,
                ),
              ]
          setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width, text: lines })
        }
        renderer.domElement.style.cursor = 'pointer'
      } else {
        setHover(null)
        renderer.domElement.style.cursor = 'grab'
      }
    }
    const onLeave = () => setHover(null)
    renderer.domElement.addEventListener('mousemove', onMove)
    renderer.domElement.addEventListener('mouseleave', onLeave)

    const resize = () => {
      const w = wrap.clientWidth || 800
      const h = wrap.clientHeight || 520
      const profile = RENDER_QUALITY_PROFILES[qualityRef.current]
      const pixelRatio = Math.min(profile.maxPixelRatio, Math.max(window.devicePixelRatio || 1, profile.minPixelRatio))
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(w, h)
      // EffectComposer 独立缓存 DPR，必须同步，否则后处理会退回低分辨率。
      composer.setPixelRatio(pixelRatio)
      composer.setSize(w, h)
      polish.uniforms.uTexelSize.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio))
      polish.uniforms.uStrength.value = profile.sharpen
      bloom.strength = profile.bloomStrength
      starUniforms.uPixelRatio.value = pixelRatio
      labelRenderer.setSize(w, h)
      camera.aspect = w / h
      if (!controls.enabled) {
        CAM_END.set(0, camera.aspect < 1.15 ? 33 : 30, camera.aspect < 1.15 ? 78 : 58)
      }
      camera.updateProjectionMatrix()
    }
    resizeRef.current = resize
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const clock = new THREE.Clock()
    let raf = 0
    let fps = 0
    let fpsFrames = 0
    let fpsSampleAt = 0
    const tmp = new THREE.Vector3()
    const flyStart = now()
    const startPos = camera.position.clone()

    const animate = () => {
      const dt = Math.min(0.05, clock.getDelta())
      const t = clock.elapsedTime
      fpsFrames += 1
      if (t - fpsSampleAt >= 1) {
        fps = Math.round(fpsFrames / (t - fpsSampleAt))
        fpsFrames = 0
        fpsSampleAt = t
      }
      syncScene()

      // 电影式推进
      const flyT = Math.min(1, (now() - flyStart) / 2.6)
      if (flyT < 1) {
        const e = 1 - Math.pow(1 - flyT, 3)
        camera.position.lerpVectors(startPos, CAM_END, e)
        camera.lookAt(core.position)
      } else if (!controls.enabled) {
        controls.enabled = true
      }
      controls.autoRotate = controls.enabled && !reduced && orbitSpeedRef.current > 0
      controls.autoRotateSpeed = 0.45 * orbitSpeedRef.current

      const gs = groupsRef.current
      const totalCpu = gs.reduce((s, g) => s + (g.cpu ?? 0), 0)
      const hubIntensity = Math.min(1, totalCpu / 100)
      plasmaMat.uniforms.uTime.value = t
      plasmaMat.uniforms.uIntensity.value += (hubIntensity - plasmaMat.uniforms.uIntensity.value) * 0.04
      nebulaMat.uniforms.uTime.value = t
      starUniforms.uTime.value = t
      coreShell.rotation.y += dt * 0.25
      coreShell.rotation.x += dt * 0.08
      rings.forEach((r, i) => { r.rotation.z += dt * (0.12 + i * 0.07) * (i % 2 ? -1 : 1) })
      coreLabelEl.innerHTML = `<b>本机系统</b><span>总算力 ${totalCpu.toFixed(0)}%</span>`
      halo.scale.setScalar(20 + hubIntensity * 4 + Math.sin(t * 1.8) * 0.8)
      ;(halo.material as THREE.SpriteMaterial).opacity = 0.10 + hubIntensity * 0.08

      for (const ns of nodes.values()) {
        const g = gs.find((x) => x.agentId === ns.agentId)
        const gi = g ? (g.cpu == null ? Math.min(1, g.memMB / 4096) : Math.min(1, g.cpu / 100)) : 0
        // 曲速跃迁入场
        const age = now() - ns.spawnAt
        const enter = Math.min(1, age / 0.7)
        ns.group.scale.setScalar(0.01 + (1 - Math.pow(1 - enter, 3)) * 0.99)
        ns.group.position.y = 5 + Math.sin(t * 1.4 + ns.angle * 3) * 0.6
        ns.core.scale.setScalar(1 + gi * 0.35 + Math.sin(t * 3 + ns.angle) * 0.05)
        const energyMat = ns.core.material as THREE.ShaderMaterial
        energyMat.uniforms.uTime.value = t
        energyMat.uniforms.uIntensity.value += (gi - energyMat.uniforms.uIntensity.value) * 0.06
        ns.aura.scale.setScalar(6.0 + gi * 2.2 + Math.sin(t * 2.2 + ns.angle) * 0.3)
        ;(ns.aura.material as THREE.SpriteMaterial).opacity = ns.denied ? 0.035 : 0.08 + gi * 0.10
        ns.shell.rotation.y += dt * (ns.denied ? 0.08 : 0.3 + gi)
        ;(ns.shield.material as THREE.ShaderMaterial).uniforms.uTime.value = t
        ;(ns.beacon.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.2 * Math.sin(t * 3.5)

        // 卫星公转
        for (const sat of ns.satellites.values()) {
          sat.intensity += (sat.targetIntensity - sat.intensity) * 0.06
          sat.angle += dt * (0.25 + sat.intensity * 2.6) * (ns.denied ? 0.15 : 1)
          const y = Math.sin(sat.angle * 2) * sat.incline * sat.radius
          sat.sprite.position.set(Math.cos(sat.angle) * sat.radius, y, Math.sin(sat.angle) * sat.radius)
          sat.sprite.scale.setScalar(0.45 + sat.intensity * 0.6)
        }

        // 主干光带：圆柱拉伸对齐
        const tr = ns.trunk
        tr.intensity += (gi - tr.intensity) * 0.05
        const from = ns.group.position
        const dir = tmp.copy(core.position).sub(from)
        const len = dir.length()
        tr.band.position.copy(from).addScaledVector(dir, 0.5)
        tr.band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
        const thick = 0.05 + tr.intensity * 0.22
        tr.band.scale.set(thick, len, thick)
        // 悬停热区跟随光带
        tr.hitProxy.position.copy(tr.band.position)
        tr.hitProxy.quaternion.copy(tr.band.quaternion)
        tr.hitProxy.scale.set(0.9, len, 0.9)
        const bandMat = tr.band.material as THREE.ShaderMaterial
        bandMat.uniforms.uColor.value.copy(ns.denied ? tmpColor.setHSL(0, 0.6, 0.2) : heatColor(tr.intensity).multiplyScalar(1.15))
        bandMat.uniforms.uTime.value = t
        bandMat.uniforms.uIntensity.value = ns.denied ? 0 : tr.intensity

        // 彗星粒子 + 拖尾幽灵
        const speed = 0.1 + tr.intensity * 0.6
        const pa = tr.geom.getAttribute('position') as THREE.BufferAttribute
        const ga = tr.ghostGeom.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < tr.count; i++) {
          tr.ts[i] += dt * speed
          if (tr.ts[i] > 1) tr.ts[i] -= 1
          tr.curve.getPoint(tr.ts[i], tmp)
          pa.setXYZ(i, tmp.x, tmp.y, tmp.z)
          tr.curve.getPoint(Math.max(0, tr.ts[i] - 0.045), tmp)
          ga.setXYZ(i, tmp.x, tmp.y, tmp.z)
        }
        pa.needsUpdate = true
        ga.needsUpdate = true
        const heat = heatColor(tr.intensity).multiplyScalar(2.2)
        ;(tr.points.material as THREE.PointsMaterial).color.copy(heat)
        ;(tr.ghosts.material as THREE.PointsMaterial).color.copy(heat)
        ;(tr.points.material as THREE.PointsMaterial).size = 0.5 + tr.intensity * 0.5
        ;(tr.points.material as THREE.PointsMaterial).opacity = ns.denied ? 0.08 : 0.95
        ;(tr.ghosts.material as THREE.PointsMaterial).size = 0.3 + tr.intensity * 0.35
        ;(tr.ghosts.material as THREE.PointsMaterial).opacity = ns.denied ? 0.04 : 0.45
      }

      // 特效生命周期
      for (let i = fxList.length - 1; i >= 0; i--) {
        const fx = fxList[i]
        const age = (now() - fx.born) / fx.life
        if (age >= 1) {
          scene.remove(fx.obj)
          fxList.splice(i, 1)
          continue
        }
        const mat = (fx.obj as THREE.Mesh | THREE.Points).material as THREE.Material & { opacity: number }
        if (fx.kind === 'beam') mat.opacity = (fx.opacity ?? 0.9) * (1 - age)
        if (fx.kind === 'wave') {
          const baseScale = (fx.obj.userData.baseScale as number | undefined) ?? 1
          fx.obj.scale.setScalar(baseScale * (1 + age * 4))
          mat.opacity = (fx.opacity ?? 0.9) * (1 - age)
        }
        if (fx.kind === 'burst' && fx.geom && fx.velocities) {
          const pa = fx.geom.getAttribute('position') as THREE.BufferAttribute
          const step = 0.016
          for (let j = 0; j < pa.count; j++) {
            pa.setXYZ(j, pa.getX(j) + fx.velocities[j * 3] * step, pa.getY(j) + fx.velocities[j * 3 + 1] * step, pa.getZ(j) + fx.velocities[j * 3 + 2] * step)
          }
          pa.needsUpdate = true
          mat.opacity = 1 - age
        }
      }

      glitchAmount = Math.max(0, glitchAmount - dt * 1.6)
      glitch.uniforms.uAmount.value = glitchAmount
      glitch.uniforms.uTime.value = t

      controls.update()
      renderer.info.reset()
      composer.render()
      labelRenderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)

    // 调试探针：同步渲染一帧并导出画面（自动化视觉验证用）
    ;(window as unknown as Record<string, unknown>).__aimonSnap = () => {
      try {
        controls.update()
        renderer.info.reset()
        composer.render()
        const src = renderer.domElement
        const scale = Math.min(1, 880 / Math.max(1, src.width))
        const c2 = document.createElement('canvas')
        c2.width = Math.round(src.width * scale)
        c2.height = Math.round(src.height * scale)
        const ctx = c2.getContext('2d')
        if (!ctx) return { ok: false, error: 'no 2d ctx' }
        ctx.drawImage(src, 0, 0, c2.width, c2.height)
        return { ok: true, width: src.width, height: src.height, dataUrl: c2.toDataURL('image/jpeg', 0.82) }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    }
    ;(window as unknown as Record<string, unknown>).__aimonStats = () => ({
      agents: nodes.size,
      satellites: [...nodes.values()].reduce((sum, n) => sum + n.satellites.size, 0),
      cameraSpeed: orbitSpeedRef.current,
      cameraAutoRotate: controls.autoRotate,
      cameraAutoRotateSpeed: controls.autoRotateSpeed,
      cameraPosition: camera.position.toArray(),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      pixelRatio: renderer.getPixelRatio(),
      renderQuality: qualityRef.current,
      bufferWidth: renderer.domElement.width,
      bufferHeight: renderer.domElement.height,
      starCount,
      fps,
      antiAliasing: 'SMAA',
      sharpening: polish.uniforms.uStrength.value,
    })

    return () => {
      cancelAnimationFrame(raf)
      resizeRef.current = null
      delete (window as unknown as Record<string, unknown>).__aimonSnap
      delete (window as unknown as Record<string, unknown>).__aimonStats
      ro.disconnect()
      offEvent()
      renderer.domElement.removeEventListener('mousemove', onMove)
      renderer.domElement.removeEventListener('mouseleave', onLeave)
      controls.dispose()
      scene.traverse((object) => {
        const renderable = object as THREE.Mesh
        renderable.geometry?.dispose()
        const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material]
        materials.forEach((material) => material?.dispose())
      })
      sprite.dispose()
      composer.passes.forEach((pass) => pass.dispose())
      composer.dispose()
      renderer.dispose()
      wrap.innerHTML = ''
      nodes.clear()
      fxList.length = 0
    }
  }, [])

  if (failed) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">当前环境不支持 WebGL，请使用「监控总览」。</div>
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-primary/30 bg-[hsl(222_32%_8%/0.92)] px-3 py-2 backdrop-blur"
          style={{ left: Math.max(8, Math.min(hover.x + 14, hover.width - 230)), top: Math.max(hover.y - 10, 8) }}
        >
          {hover.text.map((l, i) => (
            <div key={i} className={i === 0 ? 'text-xs font-semibold' : 'font-data text-[11px] text-muted-foreground'}>{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}
