// audio.js — zvuk stíhačky WebAudio syntézou: proudový motor = šum přes
// rezonanční filtry (turbína) + hluboký rumble; výška/hlasitost dle plynu
// a rychlosti. Bez externích souborů. init() po prvním user gestu.
export class JetAudio {
  constructor() { this.ctx = null }

  init() {
    if (this.ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = this.ctx = new AC()
    this.master = ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(ctx.destination)

    // šumová smyčka
    const n = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    this.noise = ctx.createBufferSource()
    this.noise.buffer = buf; this.noise.loop = true

    // turbína: bandpass (svist) — frekvence roste s plynem
    this.whine = ctx.createBiquadFilter(); this.whine.type = 'bandpass'; this.whine.frequency.value = 900; this.whine.Q.value = 8
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0

    // tryskový hukot: lowpass
    this.roar = ctx.createBiquadFilter(); this.roar.type = 'lowpass'; this.roar.frequency.value = 300
    this.roarGain = ctx.createGain(); this.roarGain.gain.value = 0

    this.noise.connect(this.whine); this.whine.connect(this.whineGain); this.whineGain.connect(this.master)
    this.noise.connect(this.roar); this.roar.connect(this.roarGain); this.roarGain.connect(this.master)
    this.noise.start()

    // sub rumble
    this.sub = ctx.createOscillator(); this.sub.type = 'triangle'; this.sub.frequency.value = 42
    this.subGain = ctx.createGain(); this.subGain.gain.value = 0
    this.sub.connect(this.subGain); this.subGain.connect(this.master)
    this.sub.start()
  }

  /** throttle 0..1, speedRatio 0..1 */
  set(throttle, speedRatio) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.whine.frequency.setTargetAtTime(700 + throttle * 2400, t, 0.15)
    this.whineGain.gain.setTargetAtTime(0.02 + throttle * 0.05, t, 0.15)
    this.roar.frequency.setTargetAtTime(220 + throttle * 480 + speedRatio * 260, t, 0.15)
    this.roarGain.gain.setTargetAtTime(0.06 + throttle * 0.16, t, 0.15)
    this.sub.frequency.setTargetAtTime(36 + throttle * 30, t, 0.15)
    this.subGain.gain.setTargetAtTime(0.03 + throttle * 0.07, t, 0.15)
  }

  crash() {
    if (!this.ctx) return
    const ctx = this.ctx, t = ctx.currentTime
    const src = ctx.createBufferSource()
    const n = ctx.sampleRate * 0.6
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    src.buffer = buf
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.9, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
    src.connect(lp); lp.connect(g); g.connect(this.master)
    src.start()
  }
}
