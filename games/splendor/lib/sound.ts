/**
 * Subtle, original sound design synthesized with Web Audio (section 4.2):
 * no audio files, nothing fetched. Browsers only allow audio after a user
 * gesture, so the context is created lazily and failures are silent.
 */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A ceramic chip clack: a filtered noise click plus a short resonant body. */
function clack(ctx: AudioContext, at: number, volume = 0.18): void {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.05);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2400 + Math.random() * 600;
  band.Q.value = 3;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  noise.connect(band).connect(gain).connect(ctx.destination);
  noise.start(at);

  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(900 + Math.random() * 120, at);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(volume * 0.4, at);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
  body.connect(bodyGain).connect(ctx.destination);
  body.start(at);
  body.stop(at + 0.08);
}

export type SoundName = 'tokens' | 'card' | 'noble' | 'turn' | 'end';

export function playSound(name: SoundName, count = 1): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;

  switch (name) {
    case 'tokens':
      for (let i = 0; i < Math.min(count, 4); i++) clack(ctx, now + i * 0.07);
      return;
    case 'card': {
      // A soft swish: noise swept down through a lowpass filter.
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 0.2);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4000, now);
      filter.frequency.exponentialRampToValueAtTime(600, now + 0.18);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      noise.connect(filter).connect(gain).connect(ctx.destination);
      noise.start(now);
      return;
    }
    case 'noble':
    case 'end': {
      // A short brass-like arpeggio; the end fanfare adds a final chord.
      const notes = name === 'noble' ? [523.25, 659.25, 783.99] : [392, 523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const start = now + i * 0.11;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.5);
      });
      return;
    }
    case 'turn': {
      // A gentle bell: two detuned sines with a slow decay.
      for (const [freq, vol] of [
        [880, 0.08],
        [1320, 0.03],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1);
      }
      return;
    }
  }
}

/** Unlocks audio on the first user gesture so later sounds can play. */
export function primeAudio(): void {
  audio();
}
