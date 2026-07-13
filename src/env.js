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
  void main() {
    vec3 dir = normalize(vDir);
    float t = clamp(dir.y, 0.0, 1.0);
    vec3 horizon = vec3(1.00, 0.62, 0.42);  // oranžová
    vec3 mid     = vec3(0.89, 0.41, 0.56);  // růžová
    vec3 zenith  = vec3(0.21, 0.19, 0.43);  // fialovo-modrá
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.45, t));
    col = mix(col, zenith, smoothstep(0.35, 1.0, t));
    float d = max(dot(dir, uSunDir), 0.0);
    col += smoothstep(0.9985, 0.9995, d) * vec3(1.0, 0.9, 0.72) * 1.3; // disk
    col += pow(d, 22.0) * vec3(1.0, 0.55, 0.30) * 0.55;               // záře
    gl_FragColor = vec4(col, 1.0);
  }
`

export class FlightEnv {
  constructor(scene, worldSize) {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: { uSunDir: { value: SUN_DIR.clone() } },
      side: THREE.BackSide, depthWrite: false,
    })
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(worldSize * 1.2, 24, 14), this.skyMat)
    this.dome.frustumCulled = false
    scene.add(this.dome)

    scene.add(new THREE.HemisphereLight(0xffc4a8, 0x3d3a45, 0.65))
    this.sun = new THREE.DirectionalLight(0xffc890, 2.1)
    this.sun.position.copy(SUN_DIR).multiplyScalar(1000)
    this.sun.castShadow = false
    scene.add(this.sun)

    // mraky ve výšce letu (billboardy) — teple tónované
    this.clouds = []
    for (let i = 0; i < 26; i++) {
      const w = 260 + Math.random() * 420
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * 0.45),
        new THREE.MeshBasicMaterial({ map: this._cloudTexture(), transparent: true, depthWrite: false, opacity: 0.8, color: 0xffd9c4 }),
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
