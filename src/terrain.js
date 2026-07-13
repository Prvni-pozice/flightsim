// terrain.js — krajina letového simulátoru. Střed = Skrýšov u Pelhřimova
// (reálný EU-DEM výškopis ×2 pro výraznější členitost + OSM pole/lesy/cesty),
// na sever za vysokým hřebenem Miami s mrakodrapy a oceánem, na západ dole
// v údolí napodobenina Grand Canyonu (terasovité rudé stěny). Barvy země
// jsou záměrně syté/malované — z výšky má krajina "hrát".
import * as THREE from 'three'
import DATA from './data/skrysov.json' with { type: 'json' }

export const WORLD = 9000            // strana světa (m)
const TEX = 2048                     // rozlišení malované textury
const SEG = 320                      // segmenty terénní mřížky

// zóny (sever = -Z)
const RIDGE_Z = -1500                // hřeben schovávající Miami
const MIAMI_Z0 = -3300, MIAMI_Z1 = -2100 // plošina města
const OCEAN_Z = -3500                // odtud oceán
const CANYON_X = -1500               // západně odtud kaňon

// ── výškopis Skrýšova (bilineární interpolace 41×41 EU-DEM gridu) ──
const E = DATA.elev
function skrysovH2(x, z) {
  const g = E.g, h = E.half
  const u = ((x - E.cx) / (2 * h) + 0.5) * (g - 1)
  const v = ((z - E.cz) / (2 * h) + 0.5) * (g - 1)
  const i = Math.max(0, Math.min(g - 2, Math.floor(u)))
  const j = Math.max(0, Math.min(g - 2, Math.floor(v)))
  const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j))
  const d = E.data
  const top = d[j * g + i] * (1 - fu) + d[j * g + i + 1] * fu
  const bot = d[(j + 1) * g + i] * (1 - fu) + d[(j + 1) * g + i + 1] * fu
  return top * (1 - fv) + bot * fv
}

// ── hodnotový šum (deterministický, 2 oktávy) ──
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

// ── globální výška světa ──
export function heightAt(x, z) {
  // 1) základ: zvlněná vysočina (šum) — kopíruje styl okolí Skrýšova
  let h = (fbm(x * 0.0011, z * 0.0011) - 0.42) * 130 + (fbm(x * 0.004 + 5, z * 0.004 + 9) - 0.5) * 26

  // 2) Skrýšov: reálný výškopis ×2, do šumu vplyne na okraji gridu
  const dxs = Math.abs(x - E.cx), dzs = Math.abs(z - E.cz)
  const inGrid = Math.max(dxs, dzs)
  if (inGrid < E.half) {
    const w = 1 - smooth(E.half * 0.72, E.half, inGrid)
    h = h * (1 - w) + skrysovH2(x, z) * 2 * w
  }

  // 3) hřeben na severu (schovává Miami) — protáhlý val kolem RIDGE_Z
  const ridge = Math.exp(-((z - RIDGE_Z) ** 2) / (2 * 300 ** 2))
  h += ridge * (150 + fbm(x * 0.002, 0) * 60)

  // 4) plošina Miami + pobřeží + oceán (sever)
  if (z < MIAMI_Z1 + 350) {
    const w = smooth(MIAMI_Z1 + 350, MIAMI_Z1, z)   // sjezd na plošinu
    h = h * (1 - w) + 3 * w
  }
  if (z < OCEAN_Z + 250) {
    const w = smooth(OCEAN_Z + 250, OCEAN_Z - 150, z)
    h = h * (1 - w) + (-8) * w                        // dno oceánu
  }

  // 5) Grand Canyon na západě: meandrující zářez s terasami
  if (x < CANYON_X + 600) {
    const cx = -2300 + Math.sin(z * 0.0009) * 380 + Math.sin(z * 0.0031) * 120
    const halfW = 520 + fbm(0, z * 0.001) * 160
    const d = Math.abs(x - cx)
    if (d < halfW) {
      const t = 1 - d / halfW                        // 0 okraj → 1 střed
      const depth = smooth(0, 0.75, t) * 190
      let ch = h - depth
      // terasy: kvantovat stěny do "vrstev" (jen na svazích)
      if (t > 0.06 && t < 0.85) {
        const step = 20
        ch = Math.round(ch / step) * step + (fbm(x * 0.02, z * 0.02) - 0.5) * 7
      }
      const w = smooth(0, 0.12, t)
      h = h * (1 - w) + ch * w
    }
  }
  return h
}

// ── malovaná textura země (sytá, "letecká") ──
// Per-pixel podklad NEvolá heightAt (to je ~10M drahých volání = mnoho
// sekund zamrzlé stránky) — výška se předpočítá do mřížky 512² a čte se
// bilineárně. Šum se čte z menší mřížky taky.
function paintTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = TEX
  const g = c.getContext('2d')
  const toPx = (x, z) => [(x / WORLD + 0.5) * TEX, (z / WORLD + 0.5) * TEX]
  const M = TEX / WORLD // m → px

  // předpočet výšek (512+1)² — ~263k volání heightAt (rychlé)
  const HN = 512
  const hf = new Float32Array((HN + 1) * (HN + 1))
  for (let j = 0; j <= HN; j++) {
    const z = (j / HN - 0.5) * WORLD
    for (let i = 0; i <= HN; i++) hf[j * (HN + 1) + i] = heightAt((i / HN - 0.5) * WORLD, z)
  }
  const hAtPx = (i, j) => { // bilineár z hf pro pixel textury
    const u = (i / TEX) * HN, v = (j / TEX) * HN
    const iu = Math.min(HN - 1, u | 0), iv = Math.min(HN - 1, v | 0)
    const fu = u - iu, fv = v - iv
    const r0 = hf[iv * (HN + 1) + iu] * (1 - fu) + hf[iv * (HN + 1) + iu + 1] * fu
    const r1 = hf[(iv + 1) * (HN + 1) + iu] * (1 - fu) + hf[(iv + 1) * (HN + 1) + iu + 1] * fu
    return r0 * (1 - fv) + r1 * fv
  }

  // 1) per-pixel podklad podle výšky/zón (ImageData)
  const img = g.createImageData(TEX, TEX)
  const px = img.data
  for (let j = 0; j < TEX; j++) {
    const z = (j / TEX - 0.5) * WORLD
    const rimH = heightAt(CANYON_X + 700, z) // okraj kaňonu — 1× na řádek
    for (let i = 0; i < TEX; i++) {
      const x = (i / TEX - 0.5) * WORLD
      const h = hAtPx(i, j)
      const n = vnoise(x * 0.008, z * 0.008)  // 1 oktáva stačí (barevná variace)
      let r, gg, b
      if (z < OCEAN_Z) {                       // oceán — sytý tyrkys → hloubka
        const t = clamp01((OCEAN_Z - z) / 900)
        r = 20 + (1 - t) * 40; gg = 120 - t * 60; b = 170 - t * 40
      } else if (z < MIAMI_Z1 + 120 && z > OCEAN_Z - 50 && h < 6) { // pláž/město podklad
        r = 216; gg = 196; b = 160
      } else if (x < CANYON_X + 600 && h < rimH - 25) {
        // kaňon: rudé strata podle výšky (pásy) — modulo VŽDY kladné
        // (h může být < −200 → floor záporný → pal[−3] = pád celého startu)
        const band = ((Math.floor((h + 200) / 20) % 4) + 4) % 4
        const pal = [[196, 92, 48], [172, 70, 40], [214, 122, 66], [150, 58, 38]]
        ;[r, gg, b] = pal[band]
        r += (n - 0.5) * 24; gg += (n - 0.5) * 18; b += (n - 0.5) * 12
      } else if (h > 150) {                    // vrcholy hřebene — skála/suť
        r = 130 + n * 40; gg = 118 + n * 34; b = 100 + n * 26
      } else {                                  // venkov: šťavnatá zeleň s variací
        const t = clamp01(h / 130)
        r = 66 + n * 60 + t * 40
        gg = 140 + n * 50 - t * 20
        b = 44 + n * 30
      }
      const k = (j * TEX + i) * 4
      px[k] = r; px[k + 1] = gg; px[k + 2] = b; px[k + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)

  // 2) patchwork polí po venkově (syté pásy — zlatá pšenice, řepka, oranice)
  const FIELD = ['#d9a83b', '#e5cf46', '#8fb43a', '#5f9432', '#8a6a42', '#b8873d', '#6da83e', '#4f7d2c']
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let f = 0; f < 900; f++) {
    const x = (rnd() - 0.5) * WORLD * 0.96
    const z = (rnd() - 0.5) * WORLD * 0.96
    if (z < MIAMI_Z1 + 380 || x < CANYON_X + 550) continue  // ne na město/kaňon
    if (Math.abs(z - RIDGE_Z) < 320) continue                // ne na hřeben
    const h = heightAt(x, z)
    if (h > 120 || h < -2) continue
    const [pxx, pzz] = toPx(x, z)
    const wpx = (60 + rnd() * 190) * M, hpx = (50 + rnd() * 150) * M
    g.save()
    g.translate(pxx, pzz); g.rotate(rnd() * Math.PI)
    g.globalAlpha = 0.55 + rnd() * 0.35
    g.fillStyle = FIELD[(rnd() * FIELD.length) | 0]
    g.fillRect(-wpx / 2, -hpx / 2, wpx, hpx)
    g.restore()
  }
  g.globalAlpha = 1

  // 3) OSM plochy Skrýšova (lesy tmavě, louky svěže, pole zlatě)
  const AREA_COL = { wood: '#2c5c22', forest: '#2c5c22', scrub: '#4e7a30', farmland: '#d9a83b', meadow: '#7cc242', grass: '#6fbc3e', grassland: '#83c04a', residential: '#b9a98e' }
  for (const a of DATA.areas) {
    const col = AREA_COL[a.kind]; if (!col) continue
    g.fillStyle = col; g.globalAlpha = a.kind === 'farmland' ? 0.85 : 0.9
    g.beginPath()
    a.poly.forEach(([x, z], k) => { const [u, v] = toPx(x, z); k ? g.lineTo(u, v) : g.moveTo(u, v) })
    g.closePath(); g.fill()
  }
  g.globalAlpha = 1
  // vodní plochy (rybníky)
  g.fillStyle = '#2e7fb8'
  for (const w of DATA.water) {
    g.beginPath()
    w.poly.forEach(([x, z], k) => { const [u, v] = toPx(x, z); k ? g.lineTo(u, v) : g.moveTo(u, v) })
    g.closePath(); g.fill()
  }
  // silnice Skrýšova
  for (const r of DATA.roads) {
    const wpx = Math.max(1.2, (r.kind === 'tertiary' ? 7 : 4.5) * M)
    g.strokeStyle = r.kind === 'track' || r.kind === 'path' ? '#9a824f' : '#8d9199'
    g.lineWidth = wpx; g.lineCap = 'round'; g.lineJoin = 'round'
    g.beginPath()
    r.pts.forEach(([x, z], k) => { const [u, v] = toPx(x, z); k ? g.lineTo(u, v) : g.moveTo(u, v) })
    g.stroke()
  }

  // 4) řeka na dně kaňonu
  g.strokeStyle = '#2f8f74'; g.lineWidth = Math.max(2, 55 * M); g.lineCap = 'round'
  g.beginPath()
  for (let z = -WORLD / 2; z < WORLD / 2; z += 90) {
    const cx = -2300 + Math.sin(z * 0.0009) * 380 + Math.sin(z * 0.0031) * 120
    const [u, v] = toPx(cx, z)
    z <= -WORLD / 2 + 90 ? g.moveTo(u, v) : g.lineTo(u, v)
  }
  g.stroke()

  // 5) Miami: ulice (grid) na plošině
  g.strokeStyle = '#6d7076'; g.lineWidth = Math.max(1.5, 14 * M)
  for (let x = -900; x <= 900; x += 150) {
    const [u0, v0] = toPx(x, MIAMI_Z0), [u1, v1] = toPx(x, MIAMI_Z1)
    g.beginPath(); g.moveTo(u0, v0); g.lineTo(u1, v1); g.stroke()
  }
  for (let z = MIAMI_Z0; z <= MIAMI_Z1; z += 150) {
    const [u0, v0] = toPx(-900, z), [u1, v1] = toPx(900, z)
    g.beginPath(); g.moveTo(u0, v0); g.lineTo(u1, v1); g.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// ── stavba světa ──
export function buildWorld(scene) {
  // terén
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG)
  geo.rotateX(-Math.PI / 2)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)))
  geo.computeVertexNormals()
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paintTexture(), roughness: 0.95 }))
  ground.receiveShadow = false
  scene.add(ground)

  // oceán (lesklá hladina nad dnem)
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD / 2 + 600).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1173a8, metalness: 0.35, roughness: 0.25, transparent: true, opacity: 0.92 }),
  )
  ocean.position.set(0, 0.4, OCEAN_Z - WORLD / 4)
  scene.add(ocean)

  // ── domy Skrýšova (nízké kvádry + barevná střecha — z výšky stačí) ──
  const houseGeo = new THREE.BoxGeometry(1, 1, 1)
  const wallInst = new THREE.InstancedMesh(houseGeo, new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9 }), DATA.buildings.length)
  const roofInst = new THREE.InstancedMesh(houseGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), DATA.buildings.length)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3()
  const roofCol = new THREE.Color()
  DATA.buildings.forEach((b, i) => {
    const o = b.obb
    const y = heightAt(o.cx, o.cz)
    q.setFromAxisAngle(up, o.a)
    sc.set(o.L, b.walls, o.W)
    m4.compose(new THREE.Vector3(o.cx, y + b.walls / 2, o.cz), q, sc)
    wallInst.setMatrixAt(i, m4)
    sc.set(o.L + 0.6, Math.max(1.2, b.roof * 0.8), o.W + 0.6)
    m4.compose(new THREE.Vector3(o.cx, y + b.walls + Math.max(1.2, b.roof * 0.8) / 2, o.cz), q, sc)
    roofInst.setMatrixAt(i, m4)
    roofCol.setHex(b.rc || 0xaa4a32)
    roofInst.setColorAt(i, roofCol)
  })
  wallInst.computeBoundingSphere(); roofInst.computeBoundingSphere()
  scene.add(wallInst, roofInst)

  // ── Miami věže (pastelové mrakodrapy v gridu) ──
  const PASTEL = [0xf7c8d8, 0xbfe8f2, 0xfbe8b8, 0xcdeec6, 0xe6d4f2, 0xf6b8a4, 0xffffff]
  const spots = []
  let seed = 3
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647
  for (let gx = -850; gx <= 850; gx += 150) {
    for (let gz = MIAMI_Z0 + 80; gz <= MIAMI_Z1 - 80; gz += 150) {
      if (rnd() < 0.25) continue
      spots.push([gx + (rnd() - 0.5) * 40, gz + (rnd() - 0.5) * 40, 30 + rnd() * rnd() * 130])
    }
  }
  const towerInst = new THREE.InstancedMesh(houseGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.15 }), spots.length)
  const tCol = new THREE.Color()
  spots.forEach(([x, z, h], i) => {
    const w = 28 + rnd() * 34
    sc.set(w, h, w)
    m4.compose(new THREE.Vector3(x, 3 + h / 2, z), new THREE.Quaternion(), sc)
    towerInst.setMatrixAt(i, m4)
    tCol.setHex(PASTEL[(rnd() * PASTEL.length) | 0])
    towerInst.setColorAt(i, tCol)
  })
  towerInst.computeBoundingSphere()
  scene.add(towerInst)

  // ── lesy: nízké kužely v OSM lesích + pár shluků po krajině ──
  const treePts = []
  for (const a of DATA.areas) {
    if (!['wood', 'forest'].includes(a.kind)) continue
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const [x, z] of a.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
    const n = Math.min(250, ((x1 - x0) * (z1 - z0)) / 260 | 0)
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0)
      if (pointInPoly(x, z, a.poly)) treePts.push([x, z])
    }
  }
  for (let cl = 0; cl < 60; cl++) { // náhodné remízky po vysočině
    const cx = (rnd() - 0.5) * WORLD * 0.85, cz = (rnd() - 0.5) * WORLD * 0.85
    if (cz < MIAMI_Z1 + 420 || cx < CANYON_X + 600 || Math.abs(cz - RIDGE_Z) < 300) continue
    if (heightAt(cx, cz) > 120) continue
    const n = 8 + (rnd() * 24 | 0)
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 70
      treePts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
    }
  }
  const treeGeo = new THREE.ConeGeometry(4.5, 13, 6)
  const treeInst = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0x2e6428, roughness: 0.95 }), treePts.length)
  treePts.forEach(([x, z], i) => {
    const s = 0.7 + rnd() * 0.8
    sc.set(s, s, s)
    m4.compose(new THREE.Vector3(x, heightAt(x, z) + 6.5 * s - 1, z), new THREE.Quaternion(), sc)
    treeInst.setMatrixAt(i, m4)
  })
  treeInst.computeBoundingSphere()
  scene.add(treeInst)

  return { heightAt }
}

function pointInPoly(x, z, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
