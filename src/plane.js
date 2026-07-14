// plane.js — F-16 Fighting Falcon (nízkopolygonová silueta: trup, delta
// křídla, šípové ocasní plochy, jedna SOP, sání pod trupem, kapkovitý
// překryt) + arkádová letová fyzika (tah/odpor/vztlak zjednodušeně,
// koordinovaná zatáčka z náklonu).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// výchozí spec = F-16; závodní speciál (Edge 540) předá vlastní hodnoty
const DEFAULT_SPEC = {
  minSpeed: 55,        // m/s — pádová rychlost
  maxSpeed: 320,       // m/s — plný plyn
  pitchRate: 1.05,     // rad/s max
  rollRate: 2.6,       // rad/s max
  accelTau: 3.2,       // s — doběh rychlosti k cílové
  maxBank: 1.15,       // rad — cílový náklon při plném rollu
}

function paint(geo, hex) {
  const c = new THREE.Color(hex)
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

// trojúhelníkový extrude z 2D bodů v rovině XZ (y=tloušťka) — křídla/ocasy
function slab(pts, y0, y1, hex) {
  const shape = new THREE.Shape()
  shape.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1])
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false })
  g.rotateX(Math.PI / 2)                 // shape-y → -z, depth → -y... srovnat:
  g.translate(0, y1, 0)
  return paint(g.toNonIndexed(), hex)
}

export function buildF16() {
  const GRAY = 0x8b96a3, DARK = 0x39404a, GLASS = 0x223a4e
  const parts = []

  // trup: kužel nosu + válec + zúžená záď (lathe by byl hezčí, stačí válce)
  parts.push(paint(new THREE.ConeGeometry(0.55, 2.6, 10).rotateX(Math.PI / 2).translate(0, 0, 6.1).toNonIndexed(), GRAY))
  parts.push(paint(new THREE.CylinderGeometry(0.62, 0.72, 6.4, 10).rotateX(Math.PI / 2).translate(0, 0, 1.6).toNonIndexed(), GRAY))
  parts.push(paint(new THREE.CylinderGeometry(0.72, 0.5, 3.4, 10).rotateX(Math.PI / 2).translate(0, 0, -3.3).toNonIndexed(), GRAY))
  // tryska
  parts.push(paint(new THREE.CylinderGeometry(0.5, 0.42, 0.9, 10).rotateX(Math.PI / 2).translate(0, 0, -5.4).toNonIndexed(), DARK))
  // sání pod trupem
  parts.push(paint(new THREE.CylinderGeometry(0.42, 0.46, 2.6, 8).rotateX(Math.PI / 2).translate(0, -0.62, 2.2).toNonIndexed(), DARK))
  // překryt kabiny (kapka)
  const canopy = new THREE.SphereGeometry(0.52, 10, 8)
  canopy.scale(0.85, 0.72, 1.9); canopy.translate(0, 0.55, 3.4)
  parts.push(paint(canopy.toNonIndexed(), GLASS))
  // hřbetní přechod k SOP
  parts.push(paint(new THREE.BoxGeometry(0.3, 0.5, 3.6).translate(0, 0.55, -2.2).toNonIndexed(), GRAY))

  // delta křídla (span ~9.5 m) — body [x=rozpětí, z=délka]
  parts.push(slab([[0.55, 2.2], [4.9, -1.4], [4.9, -2.2], [0.55, -2.4]], -0.06, 0.06, GRAY))
  parts.push(slab([[-0.55, 2.2], [-4.9, -1.4], [-4.9, -2.2], [-0.55, -2.4]], -0.06, 0.06, GRAY))
  // vodorovné ocasní plochy
  parts.push(slab([[0.4, -3.2], [2.6, -4.6], [2.6, -5.2], [0.4, -5.0]], -0.05, 0.05, GRAY))
  parts.push(slab([[-0.4, -3.2], [-2.6, -4.6], [-2.6, -5.2], [-0.4, -5.0]], -0.05, 0.05, GRAY))
  // SOP (svislá): lichoběžník v profilu (x=délka, y=výška), extrude = tloušťka
  const finShape = new THREE.Shape()
  finShape.moveTo(-3.0, 0.4); finShape.lineTo(-5.2, 0.5); finShape.lineTo(-5.6, 2.9); finShape.lineTo(-4.6, 2.9)
  finShape.closePath()
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false })
  finGeo.rotateY(-Math.PI / 2)   // profil-x (délka) → world -z (záď), tloušťka → x
  finGeo.translate(0.06, 0, 0)   // vycentrovat tloušťku na osu trupu
  parts.push(paint(finGeo.toNonIndexed(), GRAY))

  const geo = mergeGeometries(parts)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 }))
  mesh.castShadow = true

  const group = new THREE.Group()
  group.add(mesh)
  // dohořívák (afterburner) — kužel záře z trysky, škáluje s plynem
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 2.4, 8).rotateX(-Math.PI / 2).translate(0, 0, -6.6),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.85 }),
  )
  group.add(flame)
  group.userData.flame = flame
  return group
}

/** Zivko Edge 540 — akrobatický speciál Air Race: krátká rovná křídla,
 *  vrtule, kapkovitý překryt, pevný podvozek s kapotovanými koly,
 *  červeno-bílo-modrá livrej. */
export function buildEdge540() {
  const RED = 0xd42a1e, WHITE = 0xf2f4f6, BLUE = 0x1a3a6e, DARK = 0x23262b
  const parts = []
  // trup: kužel + válec (krátký, ~6.5 m)
  parts.push(paint(new THREE.ConeGeometry(0.42, 1.1, 10).rotateX(Math.PI / 2).translate(0, 0, 3.4).toNonIndexed(), RED))
  parts.push(paint(new THREE.CylinderGeometry(0.48, 0.52, 3.4, 10).rotateX(Math.PI / 2).translate(0, 0, 1.1).toNonIndexed(), WHITE))
  parts.push(paint(new THREE.CylinderGeometry(0.52, 0.28, 3.0, 10).rotateX(Math.PI / 2).translate(0, 0.05, -2.1).toNonIndexed(), RED))
  // překryt kabiny
  const canopy = new THREE.SphereGeometry(0.42, 10, 8)
  canopy.scale(0.8, 0.75, 1.5); canopy.translate(0, 0.42, 0.7)
  parts.push(paint(canopy.toNonIndexed(), 0x223a4e))
  // rovná obdélníková křídla (rozpětí ~7.5 m) s modrými konci
  parts.push(slab([[0.45, 0.9], [3.75, 0.75], [3.75, -0.55], [0.45, -0.7]], -0.05, 0.05, BLUE))
  parts.push(slab([[-0.45, 0.9], [-3.75, 0.75], [-3.75, -0.55], [-0.45, -0.7]], -0.05, 0.05, BLUE))
  // ocasní plochy
  parts.push(slab([[0.25, -2.6], [1.45, -3.1], [1.45, -3.6], [0.25, -3.5]], -0.04, 0.04, RED))
  parts.push(slab([[-0.25, -2.6], [-1.45, -3.1], [-1.45, -3.6], [-0.25, -3.5]], -0.04, 0.04, RED))
  const finShape = new THREE.Shape()
  finShape.moveTo(-2.4, 0.3); finShape.lineTo(-3.6, 0.35); finShape.lineTo(-3.85, 1.5); finShape.lineTo(-3.1, 1.5)
  finShape.closePath()
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: false })
  finGeo.rotateY(-Math.PI / 2); finGeo.translate(0.05, 0, 0)
  parts.push(paint(finGeo.toNonIndexed(), RED))
  // pevný podvozek: nohy + kapotovaná kola
  for (const sx of [-1, 1]) {
    parts.push(paint(new THREE.BoxGeometry(0.08, 0.9, 0.22).translate(sx * 0.55, -0.65, 0.9).toNonIndexed(), WHITE))
    const pant = new THREE.SphereGeometry(0.3, 8, 6)
    pant.scale(0.5, 0.75, 1.4); pant.translate(sx * 0.6, -1.15, 0.9)
    parts.push(paint(pant.toNonIndexed(), RED))
  }
  const geo = mergeGeometries(parts)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 }))
  mesh.castShadow = true
  const group = new THREE.Group()
  group.add(mesh)
  // vrtule: rotující kříž + kužel
  const prop = new THREE.Group()
  const bladeGeo = paint(new THREE.BoxGeometry(0.16, 2.4, 0.04).toNonIndexed(), DARK)
  const b1 = new THREE.Mesh(bladeGeo, mesh.material)
  const b2 = new THREE.Mesh(bladeGeo, mesh.material); b2.rotation.z = Math.PI / 2
  prop.add(b1, b2)
  prop.position.set(0, 0, 4.0)
  group.add(prop)
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 4.2), new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.8, roughness: 0.3 }))
  group.add(spinner)
  group.userData.prop = prop
  return group
}

/** spec závodního speciálu (pomalejší, ale MNOHEM obratnější než F-16) */
export const EDGE540_SPEC = {
  minSpeed: 28,        // m/s (~100 km/h)
  maxSpeed: 103,       // m/s (~370 km/h — reálné maximum Edge 540)
  pitchRate: 2.4,      // extrémně obratný
  rollRate: 6.0,       // ~420°/s reálně
  accelTau: 1.7,
  maxBank: 1.5,        // ~86° — nožový let skoro možný
}

export class Plane {
  constructor(spec = {}, mesh = null) {
    this.spec = { ...DEFAULT_SPEC, ...spec }
    this.mesh = mesh || buildF16()
    this.pos = new THREE.Vector3(0, 0, 0)
    this.quat = new THREE.Quaternion()
    this.speed = 140
    this.throttle = 0.55
    this.crashed = false
    this._fwd = new THREE.Vector3()
    this._qtmp = new THREE.Quaternion()
    this._ax = new THREE.Vector3()
  }

  /** dopředný vektor (nos letadla = +Z lokálně… model míří +Z) */
  forward() { return this._fwd.set(0, 0, 1).applyQuaternion(this.quat) }

  reset(x, y, z, headingRad = 0) {
    this.pos.set(x, y, z)
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), headingRad)
    this.speed = Math.min(140, this.spec.maxSpeed * 0.6)
    this.throttle = 0.55
    this.crashed = false
  }

  /**
   * @param input {pitch:-1..1 (+ = přitáhnout), roll:-1..1 (+ = doprava), thrUp, thrDn}
   */
  update(dt, input, heightAt) {
    if (this.crashed) return

    // plyn
    if (input.thrUp) this.throttle = Math.min(1, this.throttle + dt * 0.45)
    if (input.thrDn) this.throttle = Math.max(0, this.throttle - dt * 0.45)

    // ── letový model (arkádový, vzor brihernandez/Vazgriz): ──
    // 1. V NÁKLONU ZATÁČÍ PŘITAŽENÍ — pitch je rotace kolem lokální osy
    //    křídel, takže při banku 60° jde většina přitažení do změny kurzu
    //    (prudká zatáčka = naklonit + přitáhnout, jako ve skutečnosti).
    // 2. Náklon sám o sobě zatáčí jen LÍNĚ (malý koordinační yaw) a nos
    //    v náklonu zvolna padá (musíš přitahovat) — žádný "level kill"
    //    faktor, který dřív vypínal zatáčku při zvednutém nosu a způsoboval
    //    přeskakování mezi zatáčkou a stoupáním.
    const eff = Math.min(1, this.speed / (this.spec.minSpeed * 2)) // pomalu = mrtvé řízení

    // pitch: rotace kolem lokální X (+ = přitáhnout; umí přemet)
    const pitchRate = -input.pitch * this.spec.pitchRate * eff
    this._ax.set(1, 0, 0).applyQuaternion(this.quat)
    this._qtmp.setFromAxisAngle(this._ax, pitchRate * dt)
    this.quat.premultiply(this._qtmp)

    // roll: vstup = CÍLOVÝ úhel náklonu (tilt-friendly; po puštění se
    // křídla sama srovnají). Lokální +X je pilotovo LEVÉ křídlo (right =
    // fwd×up = −X) → bank>0 = náklon DOPRAVA.
    const rightY = this._ax.set(1, 0, 0).applyQuaternion(this.quat).y
    const upY = this._ax.set(0, 1, 0).applyQuaternion(this.quat).y // ulož ČÍSLA — _ax se níž přepíše!
    const bank = Math.atan2(rightY, upY)
    const targetBank = input.roll * this.spec.maxBank // +roll = doprava
    let dBank = targetBank - bank
    while (dBank > Math.PI) dBank -= 2 * Math.PI
    while (dBank < -Math.PI) dBank += 2 * Math.PI
    const RR = this.spec.rollRate
    const rollRate = Math.max(-RR, Math.min(RR, dBank * 3.5)) * eff
    this._ax.set(0, 0, 1).applyQuaternion(this.quat)
    this._qtmp.setFromAxisAngle(this._ax, rollRate * dt)
    this.quat.premultiply(this._qtmp)

    const sinBank = Math.sin(bank), cosBank = Math.cos(bank)

    // koordinační yaw: náklon líně stáčí kurz i bez přitažení (kolem
    // světové Y; na zádech obráceně) — jen doplněk, hlavní zatáčení dělá pitch
    const COORD = 0.5 // rad/s při plném náklonu
    const yawRate = -COORD * sinBank * (upY >= 0 ? 1 : -1)
    this._qtmp.setFromAxisAngle(this._ax.set(0, 1, 0), yawRate * dt)
    this.quat.premultiply(this._qtmp)

    // v náklonu bez přitažení nos zvolna padá (ztráta vztlaku) — dává
    // reálný pocit "zatáčku je třeba držet přitažením"
    const noseDrop = 0.22 * (1 - Math.abs(cosBank))
    if (noseDrop > 1e-4) {
      this._ax.set(1, 0, 0).applyQuaternion(this.quat)
      this._qtmp.setFromAxisAngle(this._ax, -noseDrop * dt)
      this.quat.premultiply(this._qtmp)
    }

    // rychlost: k cílové dle plynu; stoupání ubírá, klesání přidává
    const fwd = this.forward()
    const { minSpeed, maxSpeed } = this.spec
    const target = minSpeed + this.throttle * (maxSpeed - minSpeed)
    this.speed += (target - this.speed) * (dt / this.spec.accelTau)
    this.speed -= 9.81 * fwd.y * dt * 0.7
    this.speed = Math.max(minSpeed * 0.6, Math.min(maxSpeed * 1.15, this.speed))

    // pádovka: pod MIN_SPEED klesá nos
    if (this.speed < minSpeed) {
      const sink = (minSpeed - this.speed) / minSpeed
      this._ax.set(1, 0, 0).applyQuaternion(this.quat)
      this._qtmp.setFromAxisAngle(this._ax, -sink * 0.5 * dt)
      this.quat.premultiply(this._qtmp)
    }

    // pohyb
    this.pos.addScaledVector(this.forward(), this.speed * dt)

    // náraz do země
    const gy = heightAt(this.pos.x, this.pos.z)
    if (this.pos.y < gy + 2.5) this.crashed = true

    // vizuál
    this.mesh.position.copy(this.pos)
    this.mesh.quaternion.copy(this.quat)
    const flame = this.mesh.userData.flame
    if (flame) {
      const f = Math.max(0, this.throttle - 0.55) / 0.45
      flame.scale.set(1, 1, 0.3 + f * 1.6)
      flame.material.opacity = 0.25 + f * 0.65
    }
    const prop = this.mesh.userData.prop
    if (prop) prop.rotation.z += (8 + this.throttle * 40) * dt
  }

  get altitude() { return this.pos.y }
  get speedKmh() { return this.speed * 3.6 }
}
