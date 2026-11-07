// Sound design: everything is synthesised in the browser, but from physical
// models rather than raw oscillators:
//
//  • Santoor: hammered strings (two detuned courses) playing short phrases in
//    Raga Yaman, an evening raga.
//  • Temple bells: modal synthesis with beating partial pairs, rendered once
//    with an OfflineAudioContext.
//  • Effects: match strike, flame, fireworks (whistle, boom, crackle).
//  • A synthetic courtyard reverb glues it together.
//
// There is no background loop: a sound only plays when the visitor does
// something (lights a diya, launches a firework, sends a wish…). Nothing plays
// and no AudioContext exists until the visitor turns sound on.

const SA4 = 277.18; // C#4, Sa of the santoor phrases

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Karplus–Strong string. `bright` starts high (harmonics ring) and relaxes to
 * `brightEnd`, which is what makes a pluck bloom and then mellow.
 */
function pluckString(sr, freq, seconds, { feedback = 0.999, bright = 0.85, brightEnd = 0.6, brightTime = 1.2, hammer = false, buzz = 0, pick = 0.2, seed = 1 } = {}) {
  const rnd = mulberry32(seed);
  const N = Math.floor(sr * seconds);
  const out = new Float32Array(N);
  const L = Math.max(2, Math.floor(sr / freq - 0.5));
  const buf = new Float32Array(L);
  let lp = 0;
  for (let i = 0; i < L; i++) {
    lp += (rnd() * 2 - 1 - lp) * (hammer ? 0.9 : 0.5);
    buf[i] = lp;
  }
  // Pluck position: a comb that thins out some harmonics, like a real string
  const P = Math.max(1, Math.floor(L * pick));
  const src = buf.slice();
  for (let i = 0; i < L; i++) buf[i] = src[i] - 0.65 * src[(i + P) % L];
  const k = 1 / (sr * brightTime);
  let idx = 0;
  for (let n = 0; n < N; n++) {
    const next = idx + 1 === L ? 0 : idx + 1;
    const b = brightEnd + (bright - brightEnd) * Math.exp(-n * k);
    let v = feedback * (b * buf[idx] + (1 - b) * buf[next]);
    if (buzz) v -= buzz * v * v * v;
    out[n] = buf[idx];
    buf[idx] = v;
    idx = next;
  }
  let peak = 1e-6;
  for (let n = 0; n < N; n++) { const a = Math.abs(out[n]); if (a > peak) peak = a; }
  const g = 0.9 / peak;
  const fade = Math.floor(sr * 0.4);
  for (let n = 0; n < N; n++) {
    out[n] *= g;
    if (n > N - fade) out[n] *= (N - n) / fade;
  }
  return { data: out, freq: sr / (L + 0.5) };
}

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.7;
    this.voices = 0;
    this._ready = null;
    this.buffers = {};
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
    this.master.gain.linearRampToValueAtTime(this.volume, t + 0.15);
    if (!this._ready) this._ready = this._prepare();
    // one soft ghanti, so the visitor hears that sound is on
    this._ready.then(() => { if (this.enabled) this.bell({ which: 'ghanti', gain: 0.08 }); });
    return true;
  }

  disable() {
    this.enabled = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.5);
    setTimeout(() => { if (!this.enabled && this.ctx) this.ctx.suspend().catch(() => {}); }, 650);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.enabled) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.15);
  }

  setPaused(paused) {
    if (!this.ctx) return;
    if (paused) this.ctx.suspend().catch(() => {});
    else if (this.enabled) this.ctx.resume().catch(() => {});
  }

  // --- graph -----------------------------------------------------------------------
  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'playback' }));

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 7500;
    shelf.gain.value = -4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master.connect(shelf).connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._courtyardImpulse(3.0);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(this.reverb).connect(this.master);

    const bus = (gain, send) => {
      const g = ctx.createGain();
      g.gain.value = gain;
      g.connect(this.master);
      if (send) {
        const s = ctx.createGain();
        s.gain.value = send;
        g.connect(s).connect(this.reverbSend);
      }
      return g;
    };
    this.melodyBus = bus(0.85, 0.6);
    this.fxBus = bus(0.9, 0.4);

    this.noise = this._noiseBuffer(2);
  }

  /** Builds the instrument samples once, yielding so the page never stutters. */
  async _prepare() {
    const sr = this.ctx.sampleRate;
    const mk = (r) => {
      const b = this.ctx.createBuffer(1, r.data.length, sr);
      b.copyToChannel(r.data, 0);
      return { buffer: b, freq: r.freq };
    };
    // Santoor: three reference pitches, shifted by playbackRate for the rest
    const santoor = [];
    for (const [semi, seed] of [[0, 3], [7, 5], [12, 7]]) {
      const f = SA4 * 2 ** (semi / 12);
      santoor.push({ semi, ...mk(pluckString(sr, f, 4.5, { feedback: 0.9985, bright: 0.97, brightEnd: 0.62, brightTime: 0.35, hammer: true, pick: 0.11, seed })) });
      await yieldFrame();
    }
    this.buffers.santoor = santoor;
    try {
      this.buffers.templeBell = await this._renderBell(392, 7, 1);
      this.buffers.ghanti = await this._renderBell(1180, 3.5, 2);
    } catch (err) {
      console.warn('[audio] bell render failed', err);
    }
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Early reflections off stone walls, then a tail that darkens as it decays. */
  _courtyardImpulse(seconds) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      const rnd = mulberry32(17 + c * 101);
      const taps = [0.011, 0.017, 0.023, 0.031, 0.042, 0.049, 0.058, 0.071, 0.083];
      taps.forEach((t, i) => { d[Math.floor((t + c * 0.0013) * sr)] += (rnd() < 0.5 ? -1 : 1) * (0.55 - i * 0.05); });
      let lp = 0;
      for (let i = Math.floor(0.02 * sr); i < len; i++) {
        const t = i / sr;
        const coef = 0.6 - 0.5 * Math.min(1, t / seconds);
        lp += ((rnd() * 2 - 1) - lp) * coef;
        d[i] += lp * Math.exp(-t * 2.6) * 0.5 * Math.min(1, t / 0.04);
      }
    }
    return buf;
  }

  async _renderBell(f0, seconds, seed) {
    const sr = this.ctx.sampleRate;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(2, Math.floor(sr * seconds), sr);
    const rnd = mulberry32(seed);
    // [ratio, amplitude, decay seconds]: pairs a hair apart make the slow "wah" of a bell
    const partials = [
      [0.5, 0.18, seconds * 0.9], [1, 0.55, seconds * 0.75], [1.0035, 0.4, seconds * 0.75],
      [2.0, 0.26, seconds * 0.5], [2.74, 0.3, seconds * 0.42], [2.756, 0.18, seconds * 0.42],
      [3.98, 0.16, seconds * 0.3], [5.42, 0.11, seconds * 0.22], [6.83, 0.07, seconds * 0.16], [8.95, 0.05, seconds * 0.1],
    ];
    const out = off.createGain();
    out.gain.value = 0.35;
    out.connect(off.destination);
    for (const [ratio, amp, decay] of partials) {
      const o = off.createOscillator();
      o.frequency.value = f0 * ratio;
      const g = off.createGain();
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(amp, 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, Math.min(seconds - 0.01, decay));
      const p = off.createStereoPanner ? off.createStereoPanner() : off.createGain();
      if (p.pan) p.pan.value = (rnd() - 0.5) * 0.5;
      o.connect(g).connect(p).connect(out);
      o.start(0);
    }
    // strike: a short bright tick of metal on metal
    const n = off.createBufferSource();
    const nb = off.createBuffer(1, Math.floor(sr * 0.03), sr);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (rnd() * 2 - 1) * (1 - i / nd.length) ** 3;
    n.buffer = nb;
    const bp = off.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f0 * 6;
    bp.Q.value = 1.2;
    const ng = off.createGain();
    ng.gain.value = 0.6;
    n.connect(bp).connect(ng).connect(out);
    n.start(0);
    return off.startRendering();
  }

  _play(buffer, { bus, at = 0, rate = 1, gain = 1, pan = 0, dur = null } = {}) {
    if (!buffer || !this.ctx) return null;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = src.connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(bus);
    src.start(t);
    if (dur) {
      g.gain.setValueAtTime(gain, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
      src.stop(t + dur + 0.7);
    }
    return src;
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
    if (this.voices > 40) return false;
    this.voices++;
    setTimeout(() => { this.voices--; }, dur * 1000 + 100);
    return true;
  }

  // --- melody ------------------------------------------------------------------------
  /** A short alaap-like phrase on santoor, in Yaman (S R G M# P D N). */
  phrase(kind = null) {
    if (!this.enabled || !this.buffers.santoor) return;
    const PHRASES = [
      [[-1, 0.5], [2, 0.5], [4, 0.9], [2, 0.5], [0, 1.6, 'trem']],
      [[4, 0.55], [6, 0.55], [7, 0.9], [6, 0.45], [4, 0.6], [2, 0.5], [4, 1.5, 'trem']],
      [[7, 0.5], [9, 0.5], [11, 0.7], [12, 1.6, 'trem']],
      [[12, 0.5], [11, 0.45], [9, 0.5], [7, 0.8], [6, 0.5], [4, 1.4, 'trem']],
      [[-1, 0.45], [-3, 0.45], [-1, 0.5], [2, 0.7], [0, 1.6, 'trem']],
      [[4, 0.6], [6, 0.6], [9, 0.6], [11, 0.6], [12, 1.8, 'trem']],
    ];
    const notes = kind === 'welcome' ? [[0, 0.32], [4, 0.32], [7, 0.32], [12, 1.4, 'trem']] : PHRASES[Math.floor(Math.random() * PHRASES.length)];
    let t = this.ctx.currentTime + 0.05;
    for (const [semi, dur, style] of notes) {
      if (style === 'trem') {
        for (let k = 0; k < 6; k++) this._santoor(semi, t + k * 0.085, 0.55 - k * 0.06);
      } else {
        this._santoor(semi, t, 0.62 + Math.random() * 0.1);
      }
      t += dur * (0.92 + Math.random() * 0.16);
    }
  }

  _santoor(semi, at, vel) {
    const bank = this.buffers.santoor;
    let best = bank[0];
    for (const b of bank) if (Math.abs(b.semi - semi) < Math.abs(best.semi - semi)) best = b;
    const target = SA4 * 2 ** (semi / 12);
    const rate = target / best.freq;
    // two courses, a hair apart, like the paired strings of a santoor
    this._play(best.buffer, { bus: this.melodyBus, at, rate: rate * 1.0012, gain: vel * 0.16, pan: -0.15 });
    this._play(best.buffer, { bus: this.melodyBus, at: at + 0.004, rate: rate * 0.9989, gain: vel * 0.13, pan: 0.15 });
  }

  // --- one-shots ---------------------------------------------------------------------
  bell({ which = 'temple', gain = 0.3, pitch = 1, pan = 0 } = {}) {
    if (!this.enabled) return;
    const buf = which === 'temple' ? this.buffers.templeBell : this.buffers.ghanti;
    if (!buf) return;
    this._play(buf, { bus: this.fxBus, rate: pitch, gain, pan });
  }

  ignite() {
    if (!this.enabled || !this._voice(2)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const strike = this._noiseSource(t, 0.16);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3400;
    bp.Q.value = 0.8;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    strike.connect(bp).connect(sg).connect(this.fxBus);
    const flare = this._noiseSource(t + 0.06, 1.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(220, t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(1100, t + 0.4);
    lp.frequency.exponentialRampToValueAtTime(260, t + 1.4);
    const fg = ctx.createGain();
    fg.gain.setValueAtTime(0.0001, t + 0.06);
    fg.gain.exponentialRampToValueAtTime(0.16, t + 0.32);
    fg.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
    flare.connect(lp).connect(fg).connect(this.fxBus);
    setTimeout(() => this.bell({ which: 'temple', gain: 0.32 }), 700);
    setTimeout(() => this.phrase('welcome'), 2200);
  }

  chime() {
    if (!this.enabled) return;
    this.phrase('welcome');
  }

  launch(pan = 0) {
    if (!this.enabled || !this._voice(1.4)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const p = this._panner(pan);
    p.connect(this.fxBus);
    // the lift-off "thup" and a hiss that rises with the rocket
    const n = this._noiseSource(t, 1.0);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.9);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    n.connect(bp).connect(ng).connect(p);
    if (Math.random() < 0.35) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(1100, t);
      o.frequency.exponentialRampToValueAtTime(2300, t + 0.9);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.018, t + 0.1);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      o.connect(og).connect(p);
      o.start(t);
      o.stop(t + 1.05);
    }
  }

  burst({ size = 1, pan = 0, distance = 50, crackle = false } = {}) {
    if (!this.enabled || !this._voice(3)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.min(0.3, distance / 343);
    const level = Math.min(0.5, 0.3 * size) * Math.min(1, 45 / distance);
    const p = this._panner(pan);
    p.connect(this.fxBus);
    // body: noise through a closing lowpass, with a long, dark tail for the reverb
    const n = this._noiseSource(t, 2.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(level * 0.25, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    n.connect(lp).connect(g).connect(p);
    // thump
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(85, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.45);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(level * 1.2, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(og).connect(p);
    o.start(t);
    o.stop(t + 0.65);
    if (crackle) this.crackle(t + 0.5, 1.4, pan);
  }

  crackle(t0, dur, pan = 0) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const p = this._panner(pan);
    p.connect(this.fxBus);
    const count = 36;
    for (let i = 0; i < count; i++) {
      const t = Math.max(ctx.currentTime, t0) + Math.random() * dur;
      const n = this._noiseSource(t, 0.018);
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 2500 + Math.random() * 4000;
      hp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.06, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
      n.connect(hp).connect(g).connect(p);
    }
  }

  hiss(dur = 3, pan = 0, level = 0.04) {
    if (!this.enabled || !this._voice(dur)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const n = this._noiseSource(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4800;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.2);
    g.gain.setValueAtTime(level, t + Math.max(0.3, dur - 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this._panner(pan);
    p.connect(this.fxBus);
    n.connect(bp).connect(g).connect(p);
    this.crackle(t + 0.2, Math.max(0.2, dur - 0.3), pan);
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
