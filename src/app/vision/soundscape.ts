// Ambient soundscape: wind, a running creek and Australian bush birds, synthesised with the Web Audio API.
// Nothing is downloaded: every sound is generated in the browser, so there are no audio files to licence
// or cache. The calls are impressions, not recordings:
//   - bell miner ("bellbird"): short, high, bell-like "tink"s, often a few at once;
//   - eastern whipbird: a long rising whistle ending in a whip-crack, answered by a short "choo-choo";
//   - butcherbird / magpie: a few fluty, gliding notes with a little vibrato;
//   - small honeyeaters: quick, descending chips.

export interface SoundEngine {
  /** Fade in (resuming the context if needed). Must first be called from a user gesture. */
  start(): void;
  /** Fade out and suspend the context. */
  stop(): void;
  /** Suspend/resume without changing whether it should play (tab hidden/shown). */
  pause(): void;
  resume(): void;
  /** True once the audio context is actually running. */
  running(): boolean;
}

type Ctx = AudioContext;

const MASTER_LEVEL = 0.55;
const FADE_IN_S = 2.5;
const FADE_OUT_S = 0.5;

function audioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/** A few seconds of pink-ish noise (Paul Kellet's filter), looped by the wind and the water. */
function pinkNoise(ctx: Ctx, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }
  return buf;
}

/** A short, decaying noise burst used as a room-less "open air" reverb for the birds. */
function airImpulse(ctx: Ctx): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 1.8);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  return buf;
}

export function createSoundEngine(): SoundEngine | null {
  const Ctor = audioContextCtor();
  if (!Ctor) return null;

  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let birdBus: GainNode | null = null;
  let wanted = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const clearTimers = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };

  /** Builds the graph once, on the first start() (which runs inside a user gesture). */
  function build(): Ctx {
    const c = new Ctor!();
    ctx = c;
    master = c.createGain();
    master.gain.value = 0;
    // Gentle low-pass on everything keeps it soft and out of the way of the UI.
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7000;
    master.connect(tone).connect(c.destination);

    const noise = pinkNoise(c, 6);

    // Wind: low band of noise whose level and colour drift in slow gusts, plus a faint high whistle.
    const windSrc = c.createBufferSource();
    windSrc.buffer = noise;
    windSrc.loop = true;
    const windFilter = c.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 450;
    windFilter.Q.value = 0.8;
    const windGain = c.createGain();
    windGain.gain.value = 0.12;
    windSrc.connect(windFilter).connect(windGain).connect(master);
    const whistle = c.createBiquadFilter();
    whistle.type = 'bandpass';
    whistle.frequency.value = 1300;
    whistle.Q.value = 9;
    const whistleGain = c.createGain();
    whistleGain.gain.value = 0.0;
    windSrc.connect(whistle).connect(whistleGain).connect(master);
    windSrc.start();

    // Creek: a steady band-limited wash, offset in the loop so it doesn't line up with the wind.
    const waterSrc = c.createBufferSource();
    waterSrc.buffer = noise;
    waterSrc.loop = true;
    const waterHp = c.createBiquadFilter();
    waterHp.type = 'highpass';
    waterHp.frequency.value = 350;
    const waterLp = c.createBiquadFilter();
    waterLp.type = 'lowpass';
    waterLp.frequency.value = 2600;
    const waterGain = c.createGain();
    waterGain.gain.value = 0.07;
    const waterPan = c.createStereoPanner();
    waterPan.pan.value = -0.25;
    waterSrc.connect(waterHp).connect(waterLp).connect(waterGain).connect(waterPan).connect(master);
    waterSrc.start(0, 2.7);

    // Birds go through a little open-air reverb.
    birdBus = c.createGain();
    birdBus.gain.value = 0.9;
    const verb = c.createConvolver();
    verb.buffer = airImpulse(c);
    const wet = c.createGain();
    wet.gain.value = 0.28;
    birdBus.connect(master);
    birdBus.connect(verb).connect(wet).connect(master);

    // Store the modulated params for the schedulers.
    gusts = { windGain, windFilter, whistleGain };
    bubbleOut = waterPan;
    return c;
  }

  let gusts: { windGain: GainNode; windFilter: BiquadFilterNode; whistleGain: GainNode } | null =
    null;
  let bubbleOut: AudioNode | null = null;

  // ---- schedulers (only while wanted and running) ----

  function gust() {
    if (!wanted || !ctx || !gusts) return;
    const now = ctx.currentTime;
    const strength = Math.random() ** 1.6; // mostly calm, now and then a proper gust
    const tc = rand(0.8, 2.2);
    gusts.windGain.gain.setTargetAtTime(0.06 + 0.22 * strength, now, tc);
    gusts.windFilter.frequency.setTargetAtTime(280 + 900 * strength, now, tc);
    gusts.whistleGain.gain.setTargetAtTime(strength > 0.6 ? 0.012 * strength : 0, now, tc);
    gusts.windFilter.Q.setTargetAtTime(0.6 + strength, now, tc);
    later(rand(2500, 6000), gust);
  }

  /** Babble: tiny rising "bubble" blips layered on the wash. */
  function bubbles() {
    if (!wanted || !ctx || !bubbleOut) return;
    const c = ctx;
    const now = c.currentTime;
    const n = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const t = now + rand(0, 0.35);
      const f0 = rand(380, 1300);
      const dur = rand(0.02, 0.07);
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * rand(1.4, 2.2), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(rand(0.006, 0.02), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(bubbleOut);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    later(rand(250, 450), bubbles);
  }

  /** One sine-ish voice through its own envelope and panner into the bird bus. */
  function voice(pan: number, type: OscillatorType = 'sine') {
    const c = ctx!;
    const osc = c.createOscillator();
    osc.type = type;
    const g = c.createGain();
    g.gain.value = 0;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p).connect(birdBus!);
    return { osc, g, c };
  }

  function bellMiner(t: number, pan: number) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const { osc, g } = voice(pan + rand(-0.15, 0.15));
      const st = t + i * rand(0.18, 0.5);
      osc.frequency.setValueAtTime(rand(2500, 3300), st);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(rand(0.03, 0.05), st + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, st + rand(0.25, 0.45));
      osc.start(st);
      osc.stop(st + 0.5);
    }
  }

  function whipbird(t: number, pan: number) {
    // Male: long, slowly rising whistle…
    const { osc, g } = voice(pan);
    const len = rand(0.9, 1.5);
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.linearRampToValueAtTime(1750, t + len);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + 0.15);
    g.gain.setValueAtTime(0.025, t + len);
    // …then the crack: a very fast upward sweep that cuts off.
    osc.frequency.setValueAtTime(1600, t + len + 0.02);
    osc.frequency.exponentialRampToValueAtTime(6200, t + len + 0.09);
    g.gain.linearRampToValueAtTime(0.05, t + len + 0.05);
    g.gain.linearRampToValueAtTime(0, t + len + 0.1);
    osc.start(t);
    osc.stop(t + len + 0.15);
    // Female answer: two short notes.
    for (let i = 0; i < 2; i++) {
      const st = t + len + 0.2 + i * 0.16;
      const a = voice(pan + 0.2);
      a.osc.frequency.setValueAtTime(2300, st);
      a.osc.frequency.linearRampToValueAtTime(2000, st + 0.1);
      a.g.gain.setValueAtTime(0, st);
      a.g.gain.linearRampToValueAtTime(0.03, st + 0.02);
      a.g.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
      a.osc.start(st);
      a.osc.stop(st + 0.15);
    }
  }

  const FLUTE_NOTES = [784, 880, 988, 1175, 1319, 1568] as const; // G5–G6, a bright pentatonic-ish set

  function butcherbird(t: number, pan: number) {
    const c = ctx!;
    const { osc, g } = voice(pan, 'triangle');
    // A touch of vibrato.
    const vib = c.createOscillator();
    vib.frequency.value = rand(5, 7);
    const vibDepth = c.createGain();
    vibDepth.gain.value = rand(6, 14);
    vib.connect(vibDepth).connect(osc.frequency);
    const notes = 3 + Math.floor(Math.random() * 4);
    let st = t;
    let f = pick(FLUTE_NOTES);
    osc.frequency.setValueAtTime(f, st);
    g.gain.setValueAtTime(0, st);
    for (let i = 0; i < notes; i++) {
      const dur = rand(0.14, 0.38);
      const next = pick(FLUTE_NOTES);
      osc.frequency.setTargetAtTime(f, st, 0.015);
      g.gain.setTargetAtTime(rand(0.03, 0.05), st, 0.02);
      // Glide into the next note at the end of this one.
      osc.frequency.setTargetAtTime(next, st + dur * 0.7, 0.04);
      g.gain.setTargetAtTime(0.004, st + dur * 0.85, 0.02);
      f = next;
      st += dur + rand(0.02, 0.12);
    }
    g.gain.setTargetAtTime(0, st, 0.03);
    osc.start(t);
    vib.start(t);
    osc.stop(st + 0.3);
    vib.stop(st + 0.3);
  }

  function honeyeater(t: number, pan: number) {
    const n = 3 + Math.floor(Math.random() * 5);
    const base = rand(3200, 4200);
    for (let i = 0; i < n; i++) {
      const st = t + i * rand(0.08, 0.13);
      const { osc, g } = voice(pan);
      osc.frequency.setValueAtTime(base, st);
      osc.frequency.exponentialRampToValueAtTime(base * 0.62, st + 0.05);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.018, st + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.06);
      osc.start(st);
      osc.stop(st + 0.08);
    }
  }

  const BIRDS = [bellMiner, bellMiner, butcherbird, butcherbird, honeyeater, whipbird] as const;

  function birds() {
    if (!wanted || !ctx || !birdBus) return;
    pick(BIRDS)(ctx.currentTime + 0.05, rand(-0.8, 0.8));
    later(rand(2200, 7500), birds);
  }

  function startSchedulers() {
    clearTimers();
    gust();
    bubbles();
    later(rand(600, 1800), birds);
  }

  return {
    start() {
      wanted = true;
      const c = ctx ?? build();
      void c.resume().catch(() => {});
      const now = c.currentTime;
      master!.gain.cancelScheduledValues(now);
      master!.gain.setValueAtTime(master!.gain.value, now);
      master!.gain.linearRampToValueAtTime(MASTER_LEVEL, now + FADE_IN_S);
      startSchedulers();
    },
    stop() {
      wanted = false;
      clearTimers();
      if (!ctx || !master) return;
      const c = ctx;
      const now = c.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
      later(FADE_OUT_S * 1000 + 50, () => {
        if (!wanted) void c.suspend().catch(() => {});
      });
    },
    pause() {
      clearTimers();
      if (ctx) void ctx.suspend().catch(() => {});
    },
    resume() {
      if (!wanted || !ctx) return;
      void ctx.resume().catch(() => {});
      startSchedulers();
    },
    running() {
      return ctx?.state === 'running';
    },
  };
}
