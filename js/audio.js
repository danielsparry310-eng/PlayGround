// Fully procedural WebAudio sound design — no external assets.
import { clamp, rand } from './utils.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.volume = 0.7;
    this.noise = null;
    this.ambientStarted = false;
    this.lastHeartbeat = 0;
    this.lastAmbient = 0;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    // small procedural reverb
    const convolver = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8);
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
      }
    }
    convolver.buffer = impulse;
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.24;
    this.reverb.connect(convolver);
    convolver.connect(this.master);

    // shared noise buffer
    const nlen = Math.floor(ctx.sampleRate * 2);
    const nb = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;

    this.startAmbient();
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  noiseSource(duration) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = rand(0.85, 1.15);
    return src;
  }

  env(node, t0, peak, attack, decay, hold = 0) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    if (hold > 0) g.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + decay);
  }

  panner(pan = 0) {
    if (!this.ctx.createStereoPanner) return null;
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return p;
  }

  route(node, pan = 0, reverbAmount = 0.2) {
    const p = this.panner(pan);
    if (p) { node.connect(p); p.connect(this.sfxGain); if (reverbAmount > 0) p.connect(this.reverb); }
    else { node.connect(this.sfxGain); }
    return p;
  }

  // ---------------------------------------------------------------- weapons
  shot(kind = 'rifle', pan = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.now();
    const out = this.ctx.createGain();
    this.route(out, pan, 0.35);
    const heavy = kind === 'heavy';
    const pistol = kind === 'pistol';
    const peak = heavy ? 0.85 : pistol ? 0.55 : 0.72;

    // body noise
    const n = this.noiseSource(0.25);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(heavy ? 2600 : 5200, t);
    lp.frequency.exponentialRampToValueAtTime(heavy ? 220 : 700, t + 0.22);
    lp.Q.value = 0.9;
    n.connect(lp); lp.connect(out);
    this.env(out, t, peak, 0.003, heavy ? 0.42 : 0.22);
    n.start(t); n.stop(t + 0.5);

    // punch oscillator
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(heavy ? 90 : pistol ? 160 : 120, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.18);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(peak * 0.9, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.4 : 0.2));
    o.connect(og); og.connect(out);
    o.start(t); o.stop(t + 0.45);

    // mechanical crack
    const crack = this.ctx.createOscillator();
    crack.type = 'square';
    crack.frequency.setValueAtTime(rand(2200, 3400), t);
    crack.frequency.exponentialRampToValueAtTime(700, t + 0.03);
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.16, t + 0.002);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    crack.connect(cg); cg.connect(out);
    crack.start(t); crack.stop(t + 0.07);

    // distant echo
    const e = this.noiseSource(0.4);
    const ef = this.ctx.createBiquadFilter();
    ef.type = 'bandpass'; ef.frequency.value = 420; ef.Q.value = 1.2;
    const eg = this.ctx.createGain();
    eg.gain.setValueAtTime(0.0001, t + 0.09);
    eg.gain.exponentialRampToValueAtTime(0.12, t + 0.12);
    eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    e.connect(ef); ef.connect(eg); eg.connect(this.reverb);
    e.start(t + 0.09); e.stop(t + 0.6);
  }

  dryFire() {
    if (!this.ctx) return;
    const t = this.now();
    const n = this.noiseSource(0.04);
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2200;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    n.connect(f); f.connect(g); g.connect(this.sfxGain);
    n.start(t); n.stop(t + 0.05);
  }

  footstep(sprint = false) {
    if (!this.ctx) return;
    const t = this.now();
    const n = this.noiseSource(0.08);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = sprint ? 240 : 180;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(sprint ? 0.08 : 0.05, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    n.connect(f); f.connect(g); g.connect(this.sfxGain);
    n.start(t); n.stop(t + 0.12);
  }

  reload(stage = 0) {
    if (!this.ctx) return;
    const t = this.now() + stage * 0.42;
    const click = (freq, dur, vol) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
      const n = this.noiseSource(0.03);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq * 1.5;
      const ng = this.ctx.createGain(); ng.gain.setValueAtTime(vol * 0.7, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f); f.connect(ng); ng.connect(this.sfxGain);
      n.start(t); n.stop(t + dur + 0.02);
    };
    click(1800, 0.05, 0.16);
    click(1200, 0.08, 0.12);
    if (stage >= 1) click(900, 0.1, 0.18);
  }

  swap() { this.reload(0); }

  // --------------------------------------------------------------- feedback
  hit(headshot = false) {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(headshot ? 1500 : 1050, t);
    o.frequency.exponentialRampToValueAtTime(headshot ? 2100 : 1400, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(headshot ? 0.24 : 0.17, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (headshot ? 0.22 : 0.11));
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.25);
    if (headshot) {
      const o2 = this.ctx.createOscillator();
      o2.type = 'triangle'; o2.frequency.value = 2600;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t + 0.03);
      g2.gain.exponentialRampToValueAtTime(0.12, t + 0.035);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o2.connect(g2); g2.connect(this.sfxGain);
      o2.start(t + 0.03); o2.stop(t + 0.2);
    }
  }

  kill() {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.22);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(f); f.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.3);
  }

  hurt(pan = 0) {
    if (!this.ctx) return;
    const t = this.now();
    const n = this.noiseSource(0.2);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    const p = this.panner(pan);
    n.connect(f); f.connect(g); if (p) { g.connect(p); p.connect(this.sfxGain); } else g.connect(this.sfxGain);
    n.start(t); n.stop(t + 0.35);
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const og = this.ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.5, t + 0.005); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(og); og.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.32);
  }

  explosion(pan = 0, distance = 1) {
    if (!this.ctx) return;
    const t = this.now();
    const vol = clamp(1.1 / (1 + distance * 0.06), 0.1, 0.9);
    const n = this.noiseSource(1.6);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(90, t + 1.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    const p = this.panner(pan);
    n.connect(f); f.connect(g); if (p) { g.connect(p); p.connect(this.sfxGain); p.connect(this.reverb); } else { g.connect(this.sfxGain); g.connect(this.reverb); }
    n.start(t); n.stop(t + 1.6);
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.8);
    const og = this.ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(vol * 0.9, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(og); og.connect(this.sfxGain);
    o.start(t); o.stop(t + 1.2);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.now();
    [660, 880, 1320].forEach((freq, i) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const g = this.ctx.createGain();
      const tt = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.14, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18);
      o.connect(g); g.connect(this.sfxGain);
      o.start(tt); o.stop(tt + 0.2);
    });
  }

  waveStart() {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(165, t + 0.5);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(f); f.connect(g); g.connect(this.sfxGain); g.connect(this.reverb);
    o.start(t); o.stop(t + 1);
    for (let i = 0; i < 2; i++) {
      const tt = t + 0.15 + i * 0.24;
      const b = this.ctx.createOscillator(); b.type = 'square'; b.frequency.value = i ? 880 : 660;
      const bg = this.ctx.createGain(); bg.gain.setValueAtTime(0.0001, tt); bg.gain.exponentialRampToValueAtTime(0.06, tt + 0.005); bg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
      b.connect(bg); bg.connect(this.sfxGain);
      b.start(tt); b.stop(tt + 0.14);
    }
  }

  victory() {
    if (!this.ctx) return;
    const t = this.now();
    [392, 523, 659, 784].forEach((freq, i) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const g = this.ctx.createGain();
      const tt = t + i * 0.16;
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.16, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.6);
      o.connect(g); g.connect(this.sfxGain); g.connect(this.reverb);
      o.start(tt); o.stop(tt + 0.65);
    });
  }

  defeat() {
    if (!this.ctx) return;
    const t = this.now();
    [220, 174, 130].forEach((freq, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const g = this.ctx.createGain();
      const tt = t + i * 0.28;
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.14, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.9);
      o.connect(f); f.connect(g); g.connect(this.sfxGain); g.connect(this.reverb);
      o.start(tt); o.stop(tt + 1);
    });
  }

  ui(click = false) {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = click ? 520 : 880;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.1);
  }

  heartbeat() {
    if (!this.ctx) return;
    const t = this.now();
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.16;
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(58, tt); o.frequency.exponentialRampToValueAtTime(40, tt + 0.12);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(i ? 0.08 : 0.14, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18);
      o.connect(g); g.connect(this.sfxGain);
      o.start(tt); o.stop(tt + 0.2);
    }
  }

  // --------------------------------------------------------------- ambient
  startAmbient() {
    if (!this.ctx || this.ambientStarted) return;
    this.ambientStarted = true;
    const ctx = this.ctx;
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420; wf.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0.045;
    wind.connect(wf); wf.connect(wg); wg.connect(this.master);
    wind.start();

    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 54;
    const hg = ctx.createGain(); hg.gain.value = 0.012;
    hum.connect(hg); hg.connect(this.master); hum.start();

    const hum2 = ctx.createOscillator(); hum2.type = 'triangle'; hum2.frequency.value = 108.5;
    const hg2 = ctx.createGain(); hg2.gain.value = 0.004;
    hum2.connect(hg2); hg2.connect(this.master); hum2.start();
  }

  update(dt, { health = 100, playing = false } = {}) {
    if (!this.ctx) return;
    const now = this.now();
    if (playing && health < 34 && now - this.lastHeartbeat > (health < 20 ? 0.62 : 0.9)) {
      this.lastHeartbeat = now;
      this.heartbeat();
    }
    if (playing && now - this.lastAmbient > 18 && Math.random() < 0.3) {
      this.lastAmbient = now;
      const pan = rand(-0.8, 0.8);
      const t = now;
      const n = this.noiseSource(1.4);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      const p = this.panner(pan);
      n.connect(f); f.connect(g); if (p) { g.connect(p); p.connect(this.reverb); } else g.connect(this.reverb);
      n.start(t); n.stop(t + 2.3);
    }
  }
}
