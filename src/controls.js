// controls.js — vstup letadla:
//  mobil: náklon telefonu (DeviceOrientation) — beta = pitch, gamma = roll,
//         mapování os podle orientace displeje; plyn ± tlačítka na obrazovce
//  desktop: šipky/WASD = pitch+roll, W/S nebo +/- … plyn = Shift/Ctrl i W/S?
//         → finálně: ↑↓ pitch, ←→ roll, W = plyn +, S = plyn −
// Kalibrace: neutrální náklon se sejme při startu (hráč drží mobil pohodlně).
export class FlightControls {
  constructor() {
    this.keys = {}
    this.tilt = { beta: null, gamma: null }
    this.neutralBeta = null
    this.thrUpHeld = false
    this.thrDnHeld = false
    this.tiltActive = false

    addEventListener('keydown', e => { this.keys[e.code] = true })
    addEventListener('keyup', e => { this.keys[e.code] = false })

    this._onOrient = e => {
      if (e.beta == null || e.gamma == null) return
      this.tilt.beta = e.beta
      this.tilt.gamma = e.gamma
      this.tiltActive = true
    }
  }

  /**
   * Volat z user gesta (Start) — iOS vyžaduje requestPermission.
   * Vrací: 'ok' | 'denied' | 'insecure' | 'unsupported'
   * POZOR: iOS Safari dává DeviceOrientation JEN na HTTPS (secure context) —
   * na http:// API vůbec neexistuje / permission spadne.
   */
  async enableTilt() {
    if (typeof DeviceOrientationEvent === 'undefined') {
      return window.isSecureContext ? 'unsupported' : 'insecure'
    }
    try {
      if (DeviceOrientationEvent.requestPermission) {
        if (!window.isSecureContext) return 'insecure'
        const res = await DeviceOrientationEvent.requestPermission()
        if (res !== 'granted') return 'denied'
      }
      addEventListener('deviceorientation', this._onOrient)
      return 'ok'
    } catch {
      return window.isSecureContext ? 'denied' : 'insecure'
    }
  }

  /** Sejmout neutrální polohu (kalibrace) — volat po startu. */
  calibrate() {
    if (this.tilt.beta != null) this.neutralBeta = this.tilt.beta
  }

  bindThrottleButtons(upEl, dnEl) {
    const bind = (el, prop) => {
      const on = e => { e.preventDefault(); this[prop] = true }
      const off = e => { e.preventDefault(); this[prop] = false }
      el.addEventListener('touchstart', on, { passive: false })
      el.addEventListener('touchend', off)
      el.addEventListener('touchcancel', off)
      el.addEventListener('mousedown', on)
      el.addEventListener('mouseup', off)
      el.addEventListener('mouseleave', off)
    }
    bind(upEl, 'thrUpHeld')
    bind(dnEl, 'thrDnHeld')
  }

  getInput() {
    let pitch = 0, roll = 0

    // klávesnice — LETECKY: šipka dolů = přitáhnout (stoupá), nahoru = potlačit
    if (this.keys.ArrowUp) pitch -= 1
    if (this.keys.ArrowDown) pitch += 1
    if (this.keys.ArrowLeft || this.keys.KeyA) roll -= 1
    if (this.keys.ArrowRight || this.keys.KeyD) roll += 1

    // náklon mobilu
    if (this.tiltActive && this.tilt.beta != null) {
      let b = this.tilt.beta, g = this.tilt.gamma
      // orientace displeje: na šířku jsou osy prohozené
      const ang = (screen.orientation && screen.orientation.angle) || 0
      if (ang === 90) { const t = b; b = -g; g = t }
      else if (ang === 270 || ang === -90) { const t = b; b = g; g = -t }
      const nb = this.neutralBeta == null ? 40 : this.neutralBeta
      // náklon dopředu (beta < neutral) = stoupat, k sobě = klesat
      // (citlivost napůl — plný výchylka teď při ~2× větším náklonu)
      pitch -= Math.max(-1, Math.min(1, (b - nb) / 44))
      roll += Math.max(-1, Math.min(1, g / 50))
    }

    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      thrUp: this.thrUpHeld || !!this.keys.KeyW,
      thrDn: this.thrDnHeld || !!this.keys.KeyS,
      reset: !!this.keys.KeyR,
    }
  }
}
