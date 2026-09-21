/**
 * The noises big screen mode makes.
 *
 * Everything here is synthesised with WebAudio rather than loaded as files:
 * the sounds are a handful of tones and a filtered noise burst, and shipping
 * them as assets would cost more bytes than the code that makes them — and
 * this runs on a TV over someone's home wifi.
 *
 * Nothing in here is allowed to throw. If the browser has no AudioContext, or
 * autoplay policy hasn't been satisfied yet, the calls quietly do nothing and
 * the visuals carry the moment on their own.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

type Ctor = typeof AudioContext;

function audio(): { ctx: AudioContext; master: GainNode } | null {
  if (ctx && master) return { ctx, master };
  const Ctx: Ctor | undefined =
    window.AudioContext ?? (window as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return { ctx, master };
  } catch {
    return null;
  }
}

/**
 * Browsers refuse to start audio without a gesture, and a page opened straight
 * at its URL hasn't had one. Call this from any click or key press; it's cheap
 * and safe to call repeatedly.
 */
export function unlockAudio(): void {
  const a = audio();
  if (a && a.ctx.state === "suspended") void a.ctx.resume().catch(() => {});
}

export function setMuted(muted: boolean): void {
  const a = audio();
  if (!a) return;
  a.master.gain.setTargetAtTime(muted ? 0 : 0.5, a.ctx.currentTime, 0.02);
}

interface ToneOptions {
  type?: OscillatorType;
  /** Seconds from now. */
  at?: number;
  duration?: number;
  gain?: number;
  /** Slide to this frequency across the note, for whooshes and risers. */
  to?: number;
}

function tone(freq: number, o: ToneOptions = {}): void {
  const a = audio();
  if (!a) return;
  const { type = "triangle", at = 0, duration = 0.25, gain = 0.3, to } = o;
  const t = a.ctx.currentTime + at;
  const osc = a.ctx.createOscillator();
  const env = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  // A short attack and a long-ish exponential tail: percussive without clicking.
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(a.master);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/** Filtered white noise — the body of the drumroll and the cymbal crash. */
function noise(o: { at?: number; duration?: number; gain?: number; from?: number; to?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const { at = 0, duration = 0.4, gain = 0.25, from = 800, to = 3000 } = o;
  const t = a.ctx.currentTime + at;
  const frames = Math.max(1, Math.floor(a.ctx.sampleRate * duration));
  const buffer = a.ctx.createBuffer(1, frames, a.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = a.ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(env).connect(a.master);
  src.start(t);
  src.stop(t + duration + 0.05);
}

/** Someone's vote landed. */
export function cueVote(): void {
  tone(880, { type: "sine", duration: 0.12, gain: 0.16 });
  tone(1320, { type: "sine", at: 0.05, duration: 0.12, gain: 0.1 });
}

/** "The votes are in" — two hits and a rising tension pad. */
export function cueVerdict(): void {
  tone(160, { type: "square", duration: 0.28, gain: 0.22 });
  tone(160, { type: "square", at: 0.32, duration: 0.28, gain: 0.22 });
  tone(110, { type: "sawtooth", at: 0.7, duration: 1.1, gain: 0.12, to: 240 });
}

/** A game gets cut: a descending whoosh onto a low thud. */
export function cueCut(index = 0): void {
  const at = index * 0.22;
  noise({ at, duration: 0.45, gain: 0.2, from: 2600, to: 300 });
  tone(220, { type: "sawtooth", at: at + 0.18, duration: 0.5, gain: 0.28, to: 55 });
}

/** The build before the winner is named. */
export function cueDrumroll(duration = 2.4): void {
  const a = audio();
  if (!a) return;
  // Accelerating hits, then a swell — a snare roll made of tiny noise bursts.
  let t = 0;
  let gap = 0.13;
  while (t < duration - 0.2) {
    noise({ at: t, duration: 0.05, gain: 0.12, from: 1400, to: 2600 });
    t += gap;
    gap = Math.max(0.035, gap * 0.9);
  }
  tone(220, { type: "sawtooth", at: 0, duration, gain: 0.08, to: 660 });
}

/** The reveal. A major arpeggio, a crash, and a shimmer over the top. */
export function cueFanfare(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    tone(f, { type: "triangle", at: i * 0.11, duration: 0.7, gain: 0.3 });
    tone(f / 2, { type: "sine", at: i * 0.11, duration: 0.7, gain: 0.18 });
  });
  tone(1046.5, { type: "triangle", at: 0.5, duration: 1.6, gain: 0.32 });
  tone(1567.98, { type: "sine", at: 0.5, duration: 1.6, gain: 0.16 });
  noise({ at: 0.48, duration: 1.4, gain: 0.14, from: 4000, to: 9000 });
}
