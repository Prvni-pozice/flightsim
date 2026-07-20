// race.js — Red Bull Air Race nad Red Bull Ringem: průlet bránami v pořadí
// na čas. Pravidla (zjednodušená RBAR): dvojice pylonů = proletět MEZI nimi
// a nízko (< 28 m nad zemí, jinak +2 s), singl/šikana = proletět těsně kolem,
// dotyk pylonu = pylon "splaskne" + 3 s penalizace. Kolo = všechny brány
// v pořadí a zpět na start/cíl.
import * as THREE from 'three'
import { buildRace, heightAt, GATES, crossGate, PYLON_H, PYLON_R, WORLD } from './rbring.js'
import { Plane, buildEdge540, EDGE540_SPEC } from './plane.js'
import { FlightControls } from './controls.js'
import { FlightEnv } from './env.js'
import { JetAudio } from './audio.js'
import { Quality } from './quality.js'

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

const env = new FlightEnv(scene, WORLD, 'day')
env.applyEnvMap(renderer, scene)
const world = buildRace(scene)

const plane = new Plane(EDGE540_SPEC, buildEdge540())
scene.add(plane.mesh)

// ── stav závodu ──
const race = {
  next: 0,          // index příští brány
  prevAlong: null,  // minulá podélná pozice vůči rovině brány (crossGate)
  t: 0,             // čas kola
  running: false,   // timer běží (od průletu startem)
  penalty: 0,
  best: null,
  hitPylons: new Set(),
}
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0)
function resetPylons() {
  race.hitPylons.clear()
  const m4 = new THREE.Matrix4()
  world.pylonMap.forEach((pl, i) => {
    m4.makeTranslation(pl.x, heightAt(pl.x, pl.z) + PYLON_H / 2, pl.z)
    world.pylonInst.setMatrixAt(i, m4)
  })
  world.pylonInst.instanceMatrix.needsUpdate = true
}
function respawn() {
  const g0 = GATES[0]
  const backX = g0.x - Math.sin(g0.heading) * 450
  const backZ = g0.z - Math.cos(g0.heading) * 450
  plane.reset(backX, heightAt(backX, backZ) + 60, backZ, g0.heading)
  plane.speed = 70
  race.next = 0; race.prevAlong = null; race.t = 0; race.running = false; race.penalty = 0
  resetPylons()
}
respawn()

const controls = new FlightControls()
const audio = new JetAudio()
const quality = new Quality(renderer, env.sun, null)

// kamera (shodná s main.js)
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3()
const _back = new THREE.Vector3(), _up = new THREE.Vector3()
let camInit = false
function updateCamera(dt) {
  _back.set(0, 0, -1).applyQuaternion(plane.quat)
  _up.set(0, 1, 0).applyQuaternion(plane.quat)
  const target = plane.pos.clone().addScaledVector(_back, 16).addScaledVector(_up, 4.5)
  target.y = Math.max(target.y, heightAt(target.x, target.z) + 3)
  if (!camInit) { camPos.copy(target); camInit = true }
  const t = 1 - Math.exp(-6 * dt)
  camPos.lerp(target, t)
  camLook.copy(plane.pos).addScaledVector(plane.forward(), 30)
  camera.position.copy(camPos)
  camera.up.copy(_up).lerp(new THREE.Vector3(0, 1, 0), 0.55).normalize()
  camera.lookAt(camLook)
}

// ── HUD ──
const elSpeed = document.getElementById('speed')
const elAlt = document.getElementById('alt')
const elThr = document.getElementById('thrval')
const elMsg = document.getElementById('msg')
const elRace = document.getElementById('race')
controls.bindThrottleButtons(document.getElementById('thrUp'), document.getElementById('thrDn'))

let msgT = 0
function flash(text, secs = 1.6) { elMsg.textContent = text; msgT = secs }

// ── pravidla brány: vyhodnotit při PŘEKROČENÍ roviny brány (crossGate) ──
const GATE_ALT_MAX = PYLON_H + 5   // m AGL — výš než pylony = penalizace
function checkGate() {
  const g = GATES[race.next]
  const res = crossGate(g, race.prevAlong, plane.pos.x, plane.pos.z)
  race.prevAlong = res.along
  if (!res.crossed) return
  const agl = plane.pos.y - heightAt(plane.pos.x, plane.pos.z)
  if (!res.clean) { race.penalty += 5; flash('✖ Mimo bránu! +5 s') }
  else if (agl > GATE_ALT_MAX) { race.penalty += 2; flash('⚠️ Moc vysoko! +2 s') }
  if (race.next === 0) {
    if (race.running) {
      // dokončené kolo
      const total = race.t + race.penalty
      if (race.best == null || total < race.best) race.best = total
      flash(`🏁 Kolo: ${total.toFixed(2)} s${race.penalty ? ` (vč. +${race.penalty} s)` : ''}`, 3.5)
      race.t = 0; race.penalty = 0
      resetPylons()
    } else {
      race.running = true
      flash('🟢 START!')
    }
  } else if (res.clean) {
    flash(`✔ brána ${race.next}/${GATES.length - 1}`, 0.8)
  }
  race.next = (race.next + 1) % GATES.length
  race.prevAlong = null // nová brána — svěží stav
}

// dotyk pylonu — projdi pylony blízkých bran
function checkPylonHits() {
  const agl = plane.pos.y
  world.pylonMap.forEach((pl, i) => {
    if (race.hitPylons.has(i)) return
    const dx = plane.pos.x - pl.x, dz = plane.pos.z - pl.z
    const hitR = PYLON_R + 1.4
    if (dx * dx + dz * dz > hitR * hitR) return
    const top = heightAt(pl.x, pl.z) + PYLON_H
    if (agl < top + 1) {
      race.hitPylons.add(i)
      world.pylonInst.setMatrixAt(i, _hidden)
      world.pylonInst.instanceMatrix.needsUpdate = true
      if (race.running) { race.penalty += 3; flash('💥 Pylon! +3 s') }
      else flash('💥 Pylon!')
      audio.crash()
    }
  })
}

// ── start overlay ──
let running = false
const overlay = document.getElementById('overlay')
const startBtn = document.getElementById('startBtn')
startBtn.textContent = 'Na start'
startBtn.disabled = false
startBtn.addEventListener('click', async () => {
  try {
    audio.init()
    const tilt = await controls.enableTilt()
    if (tilt === 'ok') controls.calibrate()
    else if (tilt === 'insecure') showErr('Náklon telefonu vyžaduje HTTPS — otevři přes https://')
    else if (tilt === 'denied') showErr('Povolení pohybu zamítnuto — Nastavení > Safari > Pohyb a orientace')
  } catch (e) { showErr(e.message) }
  overlay.style.display = 'none'
  running = true
})

let crashT = 0
const clock = new THREE.Clock()
function fmt(t) { return t == null ? '—' : t.toFixed(2) + ' s' }
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
    flash('💥 Náraz! Zpět na start…', 2.2)
    crashT = 2.2
  }
  if (plane.crashed) {
    crashT -= dt
    if (crashT <= 0) respawn()
  } else {
    if (race.running) race.t += dt
    checkGate()
    checkPylonHits()
  }

  // ukazatel příští brány
  const ng = GATES[race.next]
  world.marker.position.set(ng.x, heightAt(ng.x, ng.z) + PYLON_H + 16 + Math.sin(performance.now() / 300) * 3, ng.z)
  world.marker.rotation.y += dt * 2

  // houpání balónů
  const now = performance.now() / 1000
  for (const bl of world.balloons) bl.grp.position.y = bl.baseY + Math.sin(now * 0.4 + bl.phase) * 6

  if (msgT > 0) { msgT -= dt; if (msgT <= 0) elMsg.textContent = '' }

  audio.set(plane.throttle, plane.speed / EDGE540_SPEC.maxSpeed)
  updateCamera(dt)
  env.update(camera)
  quality.update(dt)

  elSpeed.textContent = Math.round(plane.speedKmh)
  elAlt.textContent = Math.round(plane.pos.y - heightAt(plane.pos.x, plane.pos.z))
  elThr.textContent = Math.round(plane.throttle * 100)
  elRace.textContent = `⏱ ${race.running ? (race.t + race.penalty).toFixed(1) : '—'} s  ·  brána ${race.next}/${GATES.length - 1}  ·  best ${fmt(race.best)}`

  renderer.render(scene, camera)
}
tick()

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
