// rbring.js — Red Bull Air Race nad Red Bull Ringem (Spielberg, Štýrsko).
// Stylizovaný okruh v hlubokém alpském ÚDOLÍ: trať se vlní nahoru a dolů
// (žádná placka), kolem vysoké zalesněné hřebeny. Grafika ve stylu pěkných
// her před ~20 lety: málo polygonů, zato bohatá malovaná textura — svahové
// stínování (zapečené světlo), lesy s texturou, louky, pole, kerby na
// okruhu. Pylony 2× větší (50 m) = snazší trefování bran.
// Pravidla RBAR: dvojice = průlet mezi pylony nízko, singl = průletový bod,
// dotyk pylonu = splasknutí + penalizace.
import * as THREE from 'three'

export const WORLD = 6000

// ── šum ──
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

// ── výška: zvlněné ÚDOLÍ (trať jde nahoru/dolů), vysoké hřebeny kolem ──
export function heightAt(x, z) {
  let h = (fbm(x * 0.0016, z * 0.0016) - 0.38) * 110
  const r = Math.hypot(x, z + 250)
  // hory kolem údolí — vyšší a blíž = pocit létání V údolí
  h += smooth(1250, 2500, r) * (170 + fbm(x * 0.0009 + 3, z * 0.0009 + 7) * 300)
  // dno údolí: NE rovina — zvlněné (±~30 m), takže brány jsou různě vysoko
  const e = Math.hypot((x + 80) / 1250, (z + 280) / 1000)
  const valley = 1 - smooth(0.85, 1.25, e)
  const roll = 14 + (fbm(x * 0.0028 + 11, z * 0.0028 + 5) - 0.42) * 115
  h = h * (1 - valley) + roll * valley
  return h
}

// ── vzdušné brány ──
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

export const PYLON_H = 50      // 2× větší pylony — snazší orientace i trefa
export const PYLON_R = 4.8
export const PAIR_HALF = 15    // polovina rozestupu dvojice (širší okno)

/**
 * Průlet rovinou brány (sdíleno hrou i testy). Brána se vyhodnotí, když
 * letadlo PŘEKROČÍ její rovinu v koridoru ±90 m — buď čistě (v okně), nebo
 * s penalizací (mimo okno / moc vysoko).
 * @returns {crossed, clean, lat, along}
 */
export function crossGate(gate, prevAlong, x, z) {
  const dirX = Math.sin(gate.heading), dirZ = Math.cos(gate.heading)
  const relX = x - gate.x, relZ = z - gate.z
  const along = relX * dirX + relZ * dirZ
  const lat = relX * dirZ - relZ * dirX
  const window_ = gate.type === 'pair' ? PAIR_HALF - PYLON_R + 1 : 34
  const crossed = prevAlong != null && prevAlong < 0 && along >= 0 && Math.abs(lat) < 90
  return { crossed, clean: Math.abs(lat) <= window_, lat, along }
}

/** světové pozice pylonů brány */
export function gatePylons(gate) {
  if (gate.type === 'pair') {
    const px = Math.cos(gate.heading), pz = -Math.sin(gate.heading)
    return [
      { x: gate.x + px * PAIR_HALF, z: gate.z + pz * PAIR_HALF },
      { x: gate.x - px * PAIR_HALF, z: gate.z - pz * PAIR_HALF },
    ]
  }
  return [{ x: gate.x, z: gate.z }]
}

// ── malovaná textura: "krásná hra před 20 lety" — svahové stínování,
// lesy, louky s variací, pole, skály hor, kerby ──
function paintTexture() {
  const TEX = 2048
  const c = document.createElement('canvas')
  c.width = c.height = TEX
  const g = c.getContext('2d')
  const toPx = (x, z) => [(x / WORLD + 0.5) * TEX, (z / WORLD + 0.5) * TEX]
  const M = TEX / WORLD

  // předpočet výšek (levné bilineární čtení; přímé heightAt/px = vteřiny navíc)
  const HN = 512
  const hf = new Float32Array((HN + 1) * (HN + 1))
  for (let j = 0; j <= HN; j++) {
    const z = (j / HN - 0.5) * WORLD
    for (let i = 0; i <= HN; i++) hf[j * (HN + 1) + i] = heightAt((i / HN - 0.5) * WORLD, z)
  }
  const hAt = (u, v) => { // u,v ∈ mřížka HN
    const iu = Math.max(0, Math.min(HN - 1, u | 0)), iv = Math.max(0, Math.min(HN - 1, v | 0))
    const fu = u - iu, fv = v - iv
    const r0 = hf[iv * (HN + 1) + iu] * (1 - fu) + hf[iv * (HN + 1) + iu + 1] * fu
    const r1 = hf[(iv + 1) * (HN + 1) + iu] * (1 - fu) + hf[(iv + 1) * (HN + 1) + iu + 1] * fu
    return r0 * (1 - fv) + r1 * fv
  }

  const img = g.createImageData(TEX, TEX)
  const px = img.data
  const cell = WORLD / HN
  for (let j = 0; j < TEX; j++) {
    const z = (j / TEX - 0.5) * WORLD
    const v = (j / TEX) * HN
    for (let i = 0; i < TEX; i++) {
      const x = (i / TEX - 0.5) * WORLD
      const u = (i / TEX) * HN
      const h = hAt(u, v)
      // svahové stínování: gradient výšky → "slunce od JV" zapečené do barvy
      const ge = (hAt(u + 0.5, v) - hAt(u - 0.5, v)) / cell   // východní sklon
      const gn = (hAt(u, v + 0.5) - hAt(u, v - 0.5)) / cell   // jižní sklon
      const steep = Math.hypot(ge, gn)
      const light = clamp01(0.72 + ge * 0.9 - gn * 0.55)      // JV slunce
      const n = fbm(x * 0.006, z * 0.006)
      const detail = vnoise(x * 0.045, z * 0.045)             // jemné zrno
      let r, gg, b
      const forest = fbm(x * 0.0035 + 40, z * 0.0035 + 17) > 0.56 && h < 260 && steep < 0.55
      if (h > 300 || steep > 0.75) {           // skalnaté štíty a srázy
        const t = clamp01((h - 280) / 200)
        r = 128 + detail * 46 + t * 30; gg = 122 + detail * 42 + t * 30; b = 116 + detail * 40 + t * 34
      } else if (forest) {                      // les — tmavý s texturou korun
        const crown = vnoise(x * 0.09, z * 0.09)
        r = 22 + crown * 34; gg = 62 + crown * 52; b = 24 + crown * 22
      } else if (h > 190) {                     // vysokohorské louky
        r = 96 + detail * 44; gg = 132 + detail * 40; b = 58 + detail * 24
      } else {                                  // údolní louky — šťavnaté, s variací
        const hue = fbm(x * 0.0016 + 90, z * 0.0016 + 33)
        r = 72 + hue * 60 + detail * 26
        gg = 148 + hue * 40 + detail * 24
        b = 46 + hue * 22 + detail * 14
      }
      const k = (j * TEX + i) * 4
      px[k] = r * light; px[k + 1] = gg * light; px[k + 2] = b * light; px[k + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)

  // pole na dně údolí (barevný patchwork jako z letadla)
  const FIELD = ['#d9a83b', '#e5cf46', '#8fb43a', '#5f9432', '#8a6a42', '#6da83e']
  let seed = 5
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647
  for (let f = 0; f < 160; f++) {
    const x = (rnd() - 0.5) * 2600 - 80, z = (rnd() - 0.5) * 2100 - 280
    const h = heightAt(x, z)
    if (h > 60) continue
    // ne přes okruh (hrubě: dál než 90 m od každého segmentu)
    let nearTrack = false
    for (let s = 0; s < CIRCUIT.length; s++) {
      const [ax, az] = CIRCUIT[s], [bx, bz] = CIRCUIT[(s + 1) % CIRCUIT.length]
      const t = clamp01(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1))
      if (Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)) < 110) { nearTrack = true; break }
    }
    if (nearTrack) continue
    const [pxx, pzz] = toPx(x, z)
    g.save()
    g.translate(pxx, pzz); g.rotate(rnd() * Math.PI)
    g.globalAlpha = 0.5 + rnd() * 0.3
    g.fillStyle = FIELD[(rnd() * FIELD.length) | 0]
    g.fillRect(-(40 + rnd() * 120) * M / 2, -(35 + rnd() * 90) * M / 2, (40 + rnd() * 120) * M, (35 + rnd() * 90) * M)
    g.restore()
  }
  g.globalAlpha = 1

  // okruh: červeno-bílé kerby (čárkovaně) + asfalt + startovní šachovnice
  const drawLoop = (w, color, dash = null) => {
    g.strokeStyle = color; g.lineWidth = w * M; g.lineJoin = 'round'; g.lineCap = 'round'
    g.setLineDash(dash ? dash.map(d => d * M) : [])
    g.beginPath()
    CIRCUIT.forEach(([x, z], k) => { const [u2, v2] = toPx(x, z); k ? g.lineTo(u2, v2) : g.moveTo(u2, v2) })
    g.closePath(); g.stroke()
  }
  drawLoop(20, '#e8e6e0')                 // bílý lem
  drawLoop(20, '#d23b2e', [14, 14])       // červené čárky → kerby
  drawLoop(14, '#3f4247')                 // asfalt
  drawLoop(1.6, '#e8e6e0', [10, 14])      // středová čára
  g.setLineDash([])
  // šachovnice na startu (kolmo na cílovou rovinku)
  const s0 = GATES[0]
  for (let a = -2; a < 2; a++) {
    for (let bq = -4; bq < 4; bq++) {
      g.fillStyle = (a + bq) % 2 ? '#111' : '#eee'
      const wx = s0.x + Math.sin(s0.heading) * a * 5, wz = s0.z + Math.cos(s0.heading) * a * 5
      const ox = Math.cos(s0.heading) * bq * 5, oz = -Math.sin(s0.heading) * bq * 5
      const [u2, v2] = toPx(wx + ox, wz + oz)
      g.fillRect(u2, v2, 5 * M + 1, 5 * M + 1)
    }
  }
  // paddock + tribuny u cílovky
  g.fillStyle = '#9aa0a8'; g.fillRect(...toPx(-560, 390), 260 * M, 55 * M)
  g.fillStyle = '#d23b2e'; g.fillRect(...toPx(-270, 390), 150 * M, 42 * M)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// ── stavba scény ──
export function buildRace(scene) {
  const SEG = 300
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG)
  geo.rotateX(-Math.PI / 2)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)))
  geo.computeVertexNormals()
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paintTexture(), roughness: 0.95 })))

  const m4 = new THREE.Matrix4(), col = new THREE.Color(), sc = new THREE.Vector3()
  let seed = 9
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

  // pylony (červeno-bílé RBAR, singly modré)
  const pylonMap = []
  for (let gi = 0; gi < GATES.length; gi++) {
    gatePylons(GATES[gi]).forEach((pos, si) => pylonMap.push({ gi, si, ...pos }))
  }
  const pylonGeo = new THREE.ConeGeometry(PYLON_R, PYLON_H, 10)
  const pylonInst = new THREE.InstancedMesh(pylonGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), pylonMap.length)
  pylonMap.forEach((pl, i) => {
    m4.makeTranslation(pl.x, heightAt(pl.x, pl.z) + PYLON_H / 2, pl.z)
    pylonInst.setMatrixAt(i, m4)
    col.setHex(GATES[pl.gi].type === 'pair' ? (i % 2 ? 0xd42a1e : 0xe8ebee) : 0x2456b8)
    pylonInst.setColorAt(i, col)
  })
  pylonInst.computeBoundingSphere()
  scene.add(pylonInst)

  // lesní stromy 3D (kužely v lesních zónách textury — hloubka při nízkém letu)
  const treePts = []
  for (let tries = 0; tries < 9000 && treePts.length < 1500; tries++) {
    const x = (rnd() - 0.5) * WORLD * 0.85, z = (rnd() - 0.5) * WORLD * 0.85
    const h = heightAt(x, z)
    if (h > 260) continue
    if (fbm(x * 0.0035 + 40, z * 0.0035 + 17) <= 0.58) continue // jen v lesích
    treePts.push([x, z, h])
  }
  const treeInst = new THREE.InstancedMesh(
    new THREE.ConeGeometry(5, 15, 6),
    new THREE.MeshStandardMaterial({ color: 0x275222, roughness: 0.95 }),
    treePts.length,
  )
  const q0 = new THREE.Quaternion()
  treePts.forEach(([x, z, h], i) => {
    const s = 0.7 + rnd() * 0.9
    sc.set(s, s, s)
    m4.compose(new THREE.Vector3(x, h + 7.5 * s - 1, z), q0, sc)
    treeInst.setMatrixAt(i, m4)
  })
  treeInst.computeBoundingSphere()
  scene.add(treeInst)

  // horkovzdušné balóny nad údolím (barevné, pomalu se houpou)
  const balloons = []
  const BALLOON_COL = [0xd42a1e, 0xffd21e, 0x2456b8, 0x35a24a, 0xe86ba0]
  for (let i = 0; i < 6; i++) {
    const bx = (rnd() - 0.5) * 2400 - 80, bz = (rnd() - 0.5) * 1900 - 280
    const env = new THREE.Mesh(
      new THREE.SphereGeometry(16, 12, 10).scale(1, 1.15, 1),
      new THREE.MeshStandardMaterial({ color: BALLOON_COL[i % BALLOON_COL.length], roughness: 0.6 }),
    )
    const basket = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 6), new THREE.MeshStandardMaterial({ color: 0x6e4a26, roughness: 0.9 }))
    basket.position.y = -22
    const grp = new THREE.Group()
    grp.add(env, basket)
    grp.position.set(bx, heightAt(bx, bz) + 130 + rnd() * 160, bz)
    scene.add(grp)
    balloons.push({ grp, baseY: grp.position.y, phase: rnd() * Math.PI * 2 })
  }

  // tribuny u cílové rovinky (nízké kvádry se sedačkovými barvami)
  const standInst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    8,
  )
  for (let i = 0; i < 8; i++) {
    const sx = -560 + i * 55, sz = 415
    sc.set(50, 10 + (i % 2) * 3, 26)
    m4.compose(new THREE.Vector3(sx, heightAt(sx, sz) + 5, sz), q0, sc)
    standInst.setMatrixAt(i, m4)
    col.setHex(i % 2 ? 0xd23b2e : 0x8f96a0)
    standInst.setColorAt(i, col)
  }
  standInst.computeBoundingSphere()
  scene.add(standInst)

  // ukazatel příští brány
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(8, 18, 8).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xffd21e, transparent: true, opacity: 0.9 }),
  )
  scene.add(marker)

  return { heightAt, pylonInst, pylonMap, marker, balloons }
}
