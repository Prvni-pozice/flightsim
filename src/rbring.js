// rbring.js — Red Bull Air Race nad Red Bull Ringem (Spielberg, Štýrsko).
// Stylizovaný okruh (S/F rovinka, T1, dlouhá rovinka k Remus vracečce,
// Schlossgold, západní oblouk zpět) v alpském údolí + vzdušné brány podle
// reálných pravidel RBAR: pylony 25 m, dvojice = průlet vodorovně mezi
// nimi, singl = průletový bod, šikana = slalom. Penalizace za dotyk pylonu
// a za průlet moc vysoko.
import * as THREE from 'three'

export const WORLD = 6000

// ── šum (stejný princip jako terrain.js) ──
function hash2(ix, iz) {
  let n = ix * 374761393 + iz * 668265263
  n = (n ^ (n >> 13)) * 1274126177
  return ((n ^ (n >> 16)) >>> 0) / 4294967295
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1)
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz
}
function fbm(x, z) { return vnoise(x, z) * 0.65 + vnoise(x * 2.7 + 13.7, z * 2.7 + 71.3) * 0.35 }
const clamp01 = t => Math.max(0, Math.min(1, t))
const smooth = (a, b, t) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u) }

// ── stylizovaný okruh (po směru hodin; x = východ, sever = −z) ──
export const CIRCUIT = [
  [-750, 350], [350, 260],                 // cílová rovinka (na východ)
  [520, 140],                              // T1 (Niki Lauda)
  [700, -700],                             // dlouhá rovinka do kopce
  [620, -900], [460, -950],                // T3 vracečka (Remus)
  [120, -520],                             // sjezd
  [-60, -480], [-140, -560],               // T4 (Schlossgold)
  [-420, -820], [-620, -860], [-760, -740],// západní oblouk
  [-870, -300],                            // sjezd k T9
  [-830, 60], [-780, 240],                 // T9/T10 zpět na cílovku
]

// ── výška terénu: alpské údolí, okruh na rovině, kopce k okrajům ──
export function heightAt(x, z) {
  let h = (fbm(x * 0.0016, z * 0.0016) - 0.38) * 110
  const r = Math.hypot(x, z + 250)
  h += smooth(1400, 2800, r) * (90 + fbm(x * 0.0009 + 3, z * 0.0009 + 7) * 220) // hory kolem
  // rovina okruhu (elipsa přes celý areál) — hladce zapuštěná
  const e = Math.hypot((x + 80) / 1250, (z + 280) / 1000)
  const flat = 1 - smooth(0.85, 1.25, e)
  h = h * (1 - flat) + 6 * flat
  return h
}

// ── vzdušné brány: {x, z, heading (směr letu, rad), type} ──
// heading: atan2(dx, dz) směru průletu; pár pylonů stojí kolmo na něj.
function head(dx, dz) { return Math.atan2(dx, dz) }
export const GATES = [
  { x: -500, z: 320, heading: head(1, -0.08), type: 'pair' },   // START/CÍL
  { x: 280, z: 255, heading: head(1, -0.1), type: 'pair' },
  { x: 540, z: 100, heading: head(0.35, -1), type: 'single' },  // T1
  { x: 640, z: -330, heading: head(0.12, -1), type: 'pair' },
  { x: 672, z: -560, heading: head(0.05, -1), type: 'single' }, // šikana 1
  { x: 640, z: -720, heading: head(-0.2, -1), type: 'single' }, // šikana 2
  { x: 540, z: -930, heading: head(-1, -0.15), type: 'single' },// Remus
  { x: 300, z: -710, heading: head(-0.75, 1), type: 'pair' },
  { x: -110, z: -520, heading: head(-1, -0.2), type: 'single' },// Schlossgold
  { x: -500, z: -845, heading: head(-1, -0.1), type: 'pair' },
  { x: -815, z: -500, heading: head(-0.25, 1), type: 'single' },
  { x: -845, z: -80, heading: head(0.1, 1), type: 'pair' },
  { x: -775, z: 230, heading: head(0.35, 1), type: 'single' },
]

export const PYLON_H = 25
export const PAIR_HALF = 9 // polovina rozestupu dvojice pylonů

/**
 * Průlet rovinou brány (sdíleno hrou i testy). Brána se vyhodnotí, když
 * letadlo PŘEKROČÍ její rovinu v koridoru ±90 m — buď čistě (v okně), nebo
 * s penalizací (mimo okno / moc vysoko). Radius-only check dřív dovolil
 * bránu těsně minout a hráč/autopilot se zacyklil otáčením zpět.
 * @returns {crossed, clean, lat, along}
 */
export function crossGate(gate, prevAlong, x, z) {
  const dirX = Math.sin(gate.heading), dirZ = Math.cos(gate.heading)
  const relX = x - gate.x, relZ = z - gate.z
  const along = relX * dirX + relZ * dirZ
  const lat = relX * dirZ - relZ * dirX // příčná vzdálenost od osy průletu
  const window_ = gate.type === 'pair' ? PAIR_HALF - 0.8 : 30
  const crossed = prevAlong != null && prevAlong < 0 && along >= 0 && Math.abs(lat) < 90
  return { crossed, clean: Math.abs(lat) <= window_, lat, along }
}

/** světové pozice pylonů brány */
export function gatePylons(gate) {
  if (gate.type === 'pair') {
    // kolmo na směr průletu
    const px = Math.cos(gate.heading), pz = -Math.sin(gate.heading)
    return [
      { x: gate.x + px * PAIR_HALF, z: gate.z + pz * PAIR_HALF },
      { x: gate.x - px * PAIR_HALF, z: gate.z - pz * PAIR_HALF },
    ]
  }
  return [{ x: gate.x, z: gate.z }]
}

// ── malovaná textura: šťavnaté alpské louky, lesy, asfalt okruhu ──
function paintTexture() {
  const TEX = 1024
  const c = document.createElement('canvas')
  c.width = c.height = TEX
  const g = c.getContext('2d')
  const toPx = (x, z) => [(x / WORLD + 0.5) * TEX, (z / WORLD + 0.5) * TEX]
  const M = TEX / WORLD

  const img = g.createImageData(TEX, TEX)
  const px = img.data
  for (let j = 0; j < TEX; j++) {
    const z = (j / TEX - 0.5) * WORLD
    for (let i = 0; i < TEX; i++) {
      const x = (i / TEX - 0.5) * WORLD
      const n = fbm(x * 0.006, z * 0.006)
      const h = heightAt(x, z)
      let r, gg, b
      if (h > 150) { r = 168 + n * 50; gg = 160 + n * 44; b = 150 + n * 40 }        // skály/suť
      else if (n > 0.62) { r = 34 + n * 20; gg = 84 + n * 30; b = 30 }              // les
      else { const t = clamp01(h / 140); r = 78 + n * 55 + t * 30; gg = 158 + n * 45 - t * 25; b = 52 + n * 26 } // louky
      const k = (j * TEX + i) * 4
      px[k] = r; px[k + 1] = gg; px[k + 2] = b; px[k + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)

  // okruh: asfaltová stuha + světlé obrubníky
  const drawLoop = (w, color) => {
    g.strokeStyle = color; g.lineWidth = w * M; g.lineJoin = 'round'; g.lineCap = 'round'
    g.beginPath()
    CIRCUIT.forEach(([x, z], k) => { const [u, v] = toPx(x, z); k ? g.lineTo(u, v) : g.moveTo(u, v) })
    g.closePath(); g.stroke()
  }
  drawLoop(17, '#c8c2b8')  // obrubníkový lem
  drawLoop(13, '#4a4d52')  // asfalt
  // paddock/tribuny u cílové rovinky
  g.fillStyle = '#9aa0a8'
  g.fillRect(...toPx(-560, 380), 260 * M, 60 * M)
  g.fillStyle = '#d23b2e'
  g.fillRect(...toPx(-280, 380), 150 * M, 46 * M)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// ── stavba scény ──
export function buildRace(scene) {
  const SEG = 256
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG)
  geo.rotateX(-Math.PI / 2)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)))
  geo.computeVertexNormals()
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paintTexture(), roughness: 0.95 })))

  // pylony: kužely (červeno-bílé RBAR) — instance; index → {gate, sub}
  const pylonMap = []
  for (let gi = 0; gi < GATES.length; gi++) {
    gatePylons(GATES[gi]).forEach((pos, si) => pylonMap.push({ gi, si, ...pos }))
  }
  const pylonGeo = new THREE.ConeGeometry(2.4, PYLON_H, 10)
  const pylonInst = new THREE.InstancedMesh(pylonGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), pylonMap.length)
  const m4 = new THREE.Matrix4(), col = new THREE.Color()
  pylonMap.forEach((pl, i) => {
    const gy = heightAt(pl.x, pl.z)
    m4.makeTranslation(pl.x, gy + PYLON_H / 2, pl.z)
    pylonInst.setMatrixAt(i, m4)
    col.setHex(GATES[pl.gi].type === 'pair' ? (i % 2 ? 0xd42a1e : 0xe8ebee) : 0x2456b8)
    pylonInst.setColorAt(i, col)
  })
  pylonInst.computeBoundingSphere()
  scene.add(pylonInst)

  // ukazatel příští brány: vznášející se šipka (kužel špičkou dolů)
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(6, 14, 8).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xffd21e, transparent: true, opacity: 0.9 }),
  )
  scene.add(marker)

  return { heightAt, pylonInst, pylonMap, marker }
}
