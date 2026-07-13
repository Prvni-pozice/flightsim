// plane.js — F-16 Fighting Falcon (nízkopolygonová silueta: trup, delta
// křídla, šípové ocasní plochy, jedna SOP, sání pod trupem, kapkovitý
// překryt) + arkádová letová fyzika (tah/odpor/vztlak zjednodušeně,
// koordinovaná zatáčka z náklonu).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const MIN_SPEED = 55         // m/s — pádová rychlost
const MAX_SPEED = 320        // m/s — plný plyn
const PITCH_RATE = 1.05      // rad/s max
const ROLL_RATE = 2.6        // rad/s max
const ACCEL_TAU = 3.2        // s — doběh rychlosti k cílové

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

export class Plane {
  constructor() {
    this.mesh = buildF16()
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
    this.speed = 140
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

    // účinnost řízení roste s rychlostí (pomalu = mrtvé řízení)
    const eff = Math.min(1, this.speed / 110)

    // pitch: rychlost otáčení kolem lokální X (umí přemet)
    const pitchRate = -input.pitch * PITCH_RATE * eff
    this._ax.set(1, 0, 0).applyQuaternion(this.quat)
    this._qtmp.setFromAxisAngle(this._ax, pitchRate * dt)
    this.quat.premultiply(this._qtmp)

    // roll: vstup = CÍLOVÝ úhel náklonu (pro tilt ovládání přirozené;
    // po puštění se křídla sama srovnají). Úhel náklonu z right/up vektorů.
    const rightY = this._ax.set(1, 0, 0).applyQuaternion(this.quat).y
    const upY = this._ax.set(0, 1, 0).applyQuaternion(this.quat).y // ulož ČÍSLA — _ax se níž přepíše!
    // pozor na strany: lokální +X je z pohledu pilota LEVÉ křídlo (right =
    // fwd×up = −X). bank>0 (=+X křídlo nahoře) je tedy náklon DOPRAVA.
    const bank = Math.atan2(rightY, upY)
    const targetBank = input.roll * 1.15          // až ~66°; +roll = doprava
    let dBank = targetBank - bank
    while (dBank > Math.PI) dBank -= 2 * Math.PI
    while (dBank < -Math.PI) dBank += 2 * Math.PI
    const rollRate = Math.max(-ROLL_RATE, Math.min(ROLL_RATE, dBank * 3.5)) * eff
    this._ax.set(0, 0, 1).applyQuaternion(this.quat)
    this._qtmp.setFromAxisAngle(this._ax, rollRate * dt)
    this.quat.premultiply(this._qtmp)

    // koordinovaná zatáčka: náklon → otáčení kolem světové Y (na zádech ne)
    const fwd = this.forward()
    const level = Math.max(0, 1 - Math.abs(fwd.y) * 1.4)
    const bankClamped = Math.max(-1.2, Math.min(1.2, bank))
    const yawRate = -(9.81 / Math.max(this.speed, 60)) * Math.tan(bankClamped) * level * (upY >= 0 ? 1 : -1)
    this._qtmp.setFromAxisAngle(this._ax.set(0, 1, 0), yawRate * dt)
    this.quat.premultiply(this._qtmp)

    // rychlost: k cílové dle plynu; stoupání ubírá, klesání přidává
    const target = MIN_SPEED + this.throttle * (MAX_SPEED - MIN_SPEED)
    this.speed += (target - this.speed) * (dt / ACCEL_TAU)
    this.speed -= 9.81 * fwd.y * dt * 0.7
    this.speed = Math.max(35, Math.min(MAX_SPEED * 1.15, this.speed))

    // pádovka: pod MIN_SPEED klesá nos
    if (this.speed < MIN_SPEED) {
      const sink = (MIN_SPEED - this.speed) / MIN_SPEED
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
    const f = Math.max(0, this.throttle - 0.55) / 0.45
    flame.scale.set(1, 1, 0.3 + f * 1.6)
    flame.material.opacity = 0.25 + f * 0.65
  }

  get altitude() { return this.pos.y }
  get speedKmh() { return this.speed * 3.6 }
}
