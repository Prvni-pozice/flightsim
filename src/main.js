// main.js — letecký simulátor: F-16 nad Skrýšovem (výškopis ×2), za hřebenem
// na severu Miami s oceánem, na západě kaňon. Ovládání: mobil = náklon
// telefonu + plyn tlačítky, desktop = šipky + W/S. Atmosféra Miami sunset.
import * as THREE from 'three'
import { buildWorld, heightAt, WORLD } from './terrain.js'
import { Plane } from './plane.js'
import { FlightControls } from './controls.js'
import { FlightEnv } from './env.js'
import { JetAudio } from './audio.js'
import { Quality } from './quality.js'

// chyby ukázat přímo na obrazovce (mobil nemá konzoli) — jinak "mrtvé" tlačítko
function showErr(m) {
  const el = document.getElementById('msg')
  if (el) el.textContent = '⚠️ ' + m
}
addEventListener('error', e => showErr(e.message))
addEventListener('unhandledrejection', e => showErr((e.reason && e.reason.message) || String(e.reason)))

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.12
document.getElementById('app').appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.5, WORLD * 2.4)

const env = new FlightEnv(scene, WORLD)
env.applyEnvMap(renderer, scene)
buildWorld(scene)

const plane = new Plane()
scene.add(plane.mesh)
const SPAWN = { x: 0, y: null, z: 700, heading: Math.PI } // jižně od vsi, letí na sever (-Z)
function respawn() {
  const gy = heightAt(SPAWN.x, SPAWN.z)
  plane.reset(SPAWN.x, gy + 350, SPAWN.z, SPAWN.heading)
}
respawn()

const controls = new FlightControls()
const audio = new JetAudio()
const quality = new Quality(renderer, env.sun, null)

// ── kamera za letadlem (pruží, drží horizont dle náklonu letadla zlehka) ──
const camPos = new THREE.Vector3()
const camLook = new THREE.Vector3()
const _back = new THREE.Vector3()
const _up = new THREE.Vector3()
let camInit = false
function updateCamera(dt) {
  _back.set(0, 0, -1).applyQuaternion(plane.quat)       // za záď
  _up.set(0, 1, 0).applyQuaternion(plane.quat)
  const target = plane.pos.clone().addScaledVector(_back, 22).addScaledVector(_up, 6)
  target.y = Math.max(target.y, heightAt(target.x, target.z) + 3) // kamera nad terénem
  if (!camInit) { camPos.copy(target); camInit = true }
  const t = 1 - Math.exp(-6 * dt)
  camPos.lerp(target, t)
  camLook.copy(plane.pos).addScaledVector(plane.forward(), 30)
  camera.position.copy(camPos)
  camera.up.copy(_up).lerp(new THREE.Vector3(0, 1, 0), 0.55).normalize() // z části kopíruje náklon
  camera.lookAt(camLook)
}

// ── HUD ──
const elSpeed = document.getElementById('speed')
const elAlt = document.getElementById('alt')
const elThr = document.getElementById('thrval')
const elMsg = document.getElementById('msg')
controls.bindThrottleButtons(document.getElementById('thrUp'), document.getElementById('thrDn'))

// ── start overlay (user gesto: audio + tilt permission) ──
let running = false
const overlay = document.getElementById('overlay')
const startBtn = document.getElementById('startBtn')
startBtn.textContent = 'Vzlétnout' // svět je postavený (skript doběhl až sem)
startBtn.disabled = false
startBtn.addEventListener('click', async () => {
  try {
    audio.init()
    const tilt = await controls.enableTilt()
    if (tilt === 'ok') controls.calibrate() // neutrál = průměr prvních vzorků (dvojklep = rekalibrace)
    else if (tilt === 'insecure') showErr('Náklon telefonu vyžaduje HTTPS — otevři stránku přes https://')
    else if (tilt === 'denied') showErr('Povolení pohybu zamítnuto — povol v Nastavení > Safari > Pohyb a orientace')
    // 'unsupported' (desktop) = ticho, jede klávesnice
  } catch (e) { showErr(e.message) }
  overlay.style.display = 'none'
  running = true
})

let crashT = 0
const clock = new THREE.Clock()
function tick() {
  requestAnimationFrame(tick)
  const dt = Math.min(clock.getDelta(), 0.05)
  if (!running) { renderer.render(scene, camera); return }

  const input = controls.getInput()
  if (input.reset && !plane.crashed) respawn()

  const wasCrashed = plane.crashed
  plane.update(dt, input, heightAt)
  if (plane.crashed && !wasCrashed) {
    audio.crash()
    elMsg.textContent = '💥 Náraz! Restart…'
    crashT = 2.2
  }
  if (plane.crashed) {
    crashT -= dt
    if (crashT <= 0) { respawn(); elMsg.textContent = '' }
  }

  audio.set(plane.throttle, plane.speed / 320)
  updateCamera(dt)
  env.update(camera)
  quality.update(dt)

  elSpeed.textContent = Math.round(plane.speedKmh)
  elAlt.textContent = Math.round(plane.pos.y - heightAt(plane.pos.x, plane.pos.z))
  elThr.textContent = Math.round(plane.throttle * 100)

  renderer.render(scene, camera)
}
tick()

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
