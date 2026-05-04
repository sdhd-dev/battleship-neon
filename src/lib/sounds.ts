"use client";

// Tiny WebAudio synth. No assets — synth tones for level-up and coin pickups.
// AudioContext is created lazily on first user-triggered play.

let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  type W = typeof window & { webkitAudioContext?: typeof AudioContext };
  const W = window as W;
  const C = W.AudioContext ?? W.webkitAudioContext;
  if (!C) return null;
  try {
    _ctx = new C();
  } catch {
    return null;
  }
  return _ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  sweepTo?: number;
  delayMs?: number;
}

function tone(freq: number, durationMs: number, opts: ToneOpts = {}) {
  const a = ctx();
  if (!a) return;
  const start = a.currentTime + (opts.delayMs ?? 0) / 1000;
  const end = start + durationMs / 1000;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, start);
  if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, end);
  const peak = opts.gain ?? 0.16;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(g).connect(a.destination);
  osc.start(start);
  osc.stop(end + 0.04);
}

export function playLevelUp() {
  // Triumphant rising arpeggio, ~900ms total.
  tone(523, 200, { type: "triangle", gain: 0.18 }); // C5
  tone(659, 200, { type: "triangle", gain: 0.18, delayMs: 90 }); // E5
  tone(784, 240, { type: "triangle", gain: 0.18, delayMs: 180 }); // G5
  tone(1047, 420, { type: "triangle", gain: 0.22, delayMs: 280, sweepTo: 1568 }); // C6→G6
}

export function playCoin() {
  tone(880, 80, { type: "square", gain: 0.10 });
  tone(1318, 130, { type: "square", gain: 0.10, delayMs: 60 });
}
