// Web Audio sound design. Everything is synthesised (no audio files): a
// tanpura-style drone, temple bells, the strike of a match, water, and
// fireworks. Nothing plays until the visitor turns sound on (opt-in), and the
// AudioContext is only created inside that user gesture.

const TANPURA = [103.83, 138.59, 138.59, 69.3]; // Pa, Sa, Sa, low Sa (tuned to C#)

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.7;
    this.scene = 'palace';
    this.voices = 0;
    this._timers = [];
    this._droneNext = 0;
  }

  get available() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  /** Must be called from a user gesture. Resolves true when sound is on. */
  async enable() {
    if (!this.available) return false;
    try {
      if (!this.ctx) this._build();
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch (err) {
      console.warn('[audio] could not start', err);
      return false;
    }
    this.enabled = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.volume, t + 1.2);
    this._startAmbience();
    return true;
  }

  disable() {
    this.enabled = false;
    this._stopAmbience();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.4);
    setTimeout(() => { if (!this.enabled && this.ctx) this.ctx.suspend().catch(() => {}); }, 500);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.enabled) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
  }

  /** Called when the page is hidden/visible. */
  setPaused(paused) {
    if (!this.ctx) return;
    if (paused) this.ctx.suspend().catch(() => {});
    else if (this.enabled) this.ctx.resume().catch(() => {});
  }

  setScene(name) {
    this.scene = name;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.waterGain.gain.setTargetAtTime(name === 'river' ? 0.22 : 0.0, t, 0.8);
    this.droneBus.gain.setTargetAtTime(name === 'fireworks' ? 0.35 : 0.6, t, 0.8);
  }

  // --- graph ---------------------------------------------------------------
  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'playback' }));

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // Shared reverb: a synthetic hall impulse
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.droneBus = ctx.createGain();
    this.droneBus.gain.value = 0.6;
    this.droneBus.connect(this.master);
    this.droneBus.connect(this.reverbSend);

    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = 0.9;
    this.fxBus.connect(this.master);
    this.fxBus.connect(this.reverbSend);

    this.noise = this._noiseBuffer(2);

    // Tanpura wave: rich harmonics with a bright "jawari" formant
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const formant = 1 + 1.6 * Math.exp(-((i - 11) ** 2) / 18);
      imag[i] = (formant / Math.pow(i, 0.85)) * (i % 2 ? 1 : 0.8);
    }
    this.tanpuraWave = ctx.createPeriodicWave(real, imag);

    // River water: brown noise, lowpassed, with a slow swell
    const water = ctx.createBufferSource();
    water.buffer = this._brownBuffer(6);
    water.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 520;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(this.waterGain.gain);
    water.connect(wf).connect(this.waterGain).connect(this.master);
    water.start();
    lfo.start();
    this.setScene(this.scene);
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _brownBuffer(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    // Crossfade the loop seam
    const fade = 2000;
    for (let i = 0; i < fade; i++) {
      const a = i / fade;
      d[i] = d[i] * a + d[d.length - fade + i] * (1 - a);
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _noiseSource(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  _voice(dur) {
    if (this.voices > 48) return false;
    this.voices++;
    setTimeout(() => { this.voices--; }, dur * 1000 + 100);
    return true;
  }

  // --- ambience ------------------------------------------------------------
  _startAmbience() {
    this._stopAmbience();
    const tick = () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (this._droneNext < now) this._droneNext = now + 0.1;
      while (this._droneNext < now + 1.5) {
        const cycleStart = this._droneNext;
        TANPURA.forEach((f, i) => this._pluck(f, cycleStart + i * 0.95));
        this._droneNext = cycleStart + 4.4;
      }
      this._timers.push(setTimeout(tick, 600));
    };
    tick();
    const bell = () => {
      if (!this.enabled) return;
      if (this.scene !== 'fireworks') this.bell({ gain: 0.05, pitch: 0.94 + Math.random() * 0.12 });
      this._timers.push(setTimeout(bell, 14000 + Math.random() * 16000));
    };
    this._timers.push(setTimeout(bell, 6000));
  }

  _stopAmbience() {
    this._timers.forEach(clearTimeout);
    this._timers.length = 0;
  }

  _pluck(freq, t) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(3800, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 3.4);
    for (const detune of [0, 0.35]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.tanpuraWave);
      o.frequency.value = freq + detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + 4.3);
    }
    lp.connect(g).connect(this.droneBus);
  }

  // --- one-shots -----------------------------------------------------------
  bell({ gain = 0.12, pitch = 1 } = {}) {
    if (!this.enabled || !this._voice(5)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const base = 523 * pitch;
    const partials = [[1, 0.5, 4.5], [2.0, 0.22, 3.2], [2.76, 0.32, 2.6], [4.07, 0.14, 1.8], [5.4, 0.1, 1.2]];
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(this.fxBus);
    for (const [ratio, amp, decay] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  }

  ignite() {
    if (!this.enabled || !this._voice(2)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    // Strike
    const s = this._noiseSource(t, 0.14);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.9;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    s.connect(bp).connect(sg).connect(this.fxBus);
    // Flare (a soft whoomp)
    const f = this._noiseSource(t + 0.08, 1.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260, t + 0.08);
    lp.frequency.exponentialRampToValueAtTime(1300, t + 0.45);
    lp.frequency.exponentialRampToValueAtTime(300, t + 1.3);
    const fg = ctx.createGain();
    fg.gain.setValueAtTime(0.0001, t + 0.08);
    fg.gain.exponentialRampToValueAtTime(0.22, t + 0.35);
    fg.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
    f.connect(lp).connect(fg).connect(this.fxBus);
    setTimeout(() => this.bell({ gain: 0.14 }), 900);
  }

  chime() {
    if (!this.enabled) return;
    this.bell({ gain: 0.07, pitch: 1.5 });
  }

  launch(pan = 0) {
    if (!this.enabled || !this._voice(1.4)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(700 + Math.random() * 200, t);
    o.frequency.exponentialRampToValueAtTime(2000 + Math.random() * 600, t + 1.0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    const p = this._panner(pan);
    o.connect(g).connect(p).connect(this.fxBus);
    o.start(t);
    o.stop(t + 1.2);
    const n = this._noiseSource(t, 0.5);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.05, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(hp).connect(ng).connect(p);
  }

  burst({ size = 1, pan = 0, distance = 50, crackle = false } = {}) {
    if (!this.enabled || !this._voice(2)) return;
    const ctx = this.ctx;
    const delay = Math.min(0.35, distance / 343);
    const t = ctx.currentTime + delay;
    const level = Math.min(0.6, 0.35 * size) * Math.min(1, 40 / distance);
    const p = this._panner(pan);
    const n = this._noiseSource(t, 1.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    n.connect(lp).connect(g).connect(p).connect(this.fxBus);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(level * 0.9, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(og).connect(p);
    o.start(t);
    o.stop(t + 0.8);
    if (crackle) this.crackle(t + 0.4, 1.2, pan);
  }

  crackle(t0, dur, pan = 0) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const p = this._panner(pan);
    const count = 28;
    for (let i = 0; i < count; i++) {
      const t = t0 + Math.random() * dur;
      const n = this._noiseSource(t, 0.02);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000 + Math.random() * 3000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      n.connect(hp).connect(g).connect(p);
    }
    p.connect(this.fxBus);
  }

  hiss(dur = 3, pan = 0, level = 0.05) {
    if (!this.enabled || !this._voice(dur)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const n = this._noiseSource(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.15);
    g.gain.setValueAtTime(level, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g).connect(this._panner(pan)).connect(this.fxBus);
    this.crackle(t + 0.2, dur - 0.3, pan);
  }

  _panner(pan) {
    const ctx = this.ctx;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      return p;
    }
    return ctx.createGain();
  }
}
