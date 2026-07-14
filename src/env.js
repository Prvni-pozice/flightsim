// env.js — atmosféra převzatá z Miami (carmiami/environment.js): oranžovo-
// růžový západ slunce, teplé směrové světlo, kupovité mraky ve výšce letu.
// Žádné stíny (svět 9×9 km — shadow mapa by nic hezkého nedala).
import * as THREE from 'three'

export const SUN_DIR = new THREE.Vector3(0.35, 0.28, -0.6).normalize() // nízko nad severem

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const SKY_FRAG = /* glsl */`
  varying vec3 vDir;
  uniform vec3 uSunDir;
  uniform float uDay; // 0 = Miami sunset, 1 = jasný alpský den
  void main() {
    vec3 dir = normalize(vDir);
    float t = clamp(dir.y, 0.0, 1.0);
    vec3 horizon = mix(vec3(1.00, 0.62, 0.42), vec3(0.78, 0.88, 0.96), uDay);
    vec3 mid     = mix(vec3(0.89, 0.41, 0.56), vec3(0.38, 0.62, 0.90), uDay);
    vec3 zenith  = mix(vec3(0.21, 0.19, 0.43), vec3(0.14, 0.34, 0.72), uDay);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.45, t));
    col = mix(col, zenith, smoothstep(0.35, 1.0, t));
    float d = max(dot(dir, uSunDir), 0.0);
    vec3 sunCol = mix(vec3(1.0, 0.9, 0.72), vec3(1.0, 0.98, 0.9), uDay);
    col += smoothstep(0.9985, 0.9995, d) * sunCol * 1.3;                            // disk
    col += pow(d, 22.0) * mix(vec3(1.0, 0.55, 0.30), vec3(1.0, 0.9, 0.7), uDay) * 0.55; // záře
    gl_FragColor = vec4(col, 1.0);
  }
`

export class FlightEnv {
  constructor(scene, worldSize, mode = 'sunset') {
    const day = mode === 'day' ? 1 : 0
    const sunDir = day ? new THREE.Vector3(0.45, 0.75, -0.3).normalize() : SUN_DIR
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: { uSunDir: { value: sunDir.clone() }, uDay: { value: day } },
      side: THREE.BackSide, depthWrite: false,
    })
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(worldSize * 1.2, 24, 14), this.skyMat)
    this.dome.frustumCulled = false
    scene.add(this.dome)

    scene.add(day
      ? new THREE.HemisphereLight(0xcfe6ff, 0x5a7048, 0.7)
      : new THREE.HemisphereLight(0xffc4a8, 0x3d3a45, 0.65))
    this.sun = new THREE.DirectionalLight(day ? 0xfff4e0 : 0xffc890, day ? 2.4 : 2.1)
    this.sun.position.copy(sunDir).multiplyScalar(1000)
    this.sun.castShadow = false
    scene.add(this.sun)
    this._cloudTint = day ? 0xffffff : 0xffd9c4

    // mraky ve výšce letu (billboardy) — teple tónované
    this.clouds = []
    for (let i = 0; i < 26; i++) {
      const w = 260 + Math.random() * 420
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * 0.45),
        new THREE.MeshBasicMaterial({ map: this._cloudTexture(), transparent: true, depthWrite: false, opacity: 0.8, color: this._cloudTint }),
      )
      cloud.position.set(
        (Math.random() - 0.5) * worldSize * 0.95,
        420 + Math.random() * 700,
        (Math.random() - 0.5) * worldSize * 0.95,
      )
      scene.add(cloud)
      this.clouds.push(cloud)
    }
  }

  _cloudTexture() {
    const c = document.createElement('canvas')
    c.width = 320; c.height = 160
    const g = c.getContext('2d')
    const n = 7 + (Math.random() * 5 | 0)
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const px2 = 160 + (t - 0.5) * 220
      const py = 106 - Math.sin(t * Math.PI) * 36 - Math.random() * 16
      const r = 30 + Math.random() * 28
      const grad = g.createRadialGradient(px2, py + r * 0.3, r * 0.2, px2, py, r)
      grad.addColorStop(0, 'rgba(255,244,235,0.95)')
      grad.addColorStop(0.6, 'rgba(255,228,210,0.85)')
      grad.addColorStop(1, 'rgba(255,214,190,0)')
      g.fillStyle = grad
      g.beginPath(); g.arc(px2, py, r, 0, Math.PI * 2); g.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  applyEnvMap(renderer, scene) {
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envScene = new THREE.Scene()
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat))
    const rt = pmrem.fromScene(envScene, 0.05)
    scene.environment = rt.texture
    scene.environmentIntensity = 0.4
    pmrem.dispose()
  }

  update(camera) {
    this.dome.position.copy(camera.position)
    for (const c of this.clouds) c.lookAt(camera.position)
  }
}
