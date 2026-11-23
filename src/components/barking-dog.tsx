"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type AudioCtor = typeof AudioContext;

/** One "woof", made with the browser's audio engine (no sound file): a short growl whose pitch drops quickly. */
function woof(ctx: AudioContext, at: number, pitch = 1) {
  const len = 0.2;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(520 * pitch, at);
  osc.frequency.exponentialRampToValueAtTime(150 * pitch, at + len);
  const body = ctx.createBiquadFilter();
  body.type = "bandpass";
  body.frequency.setValueAtTime(900, at);
  body.frequency.exponentialRampToValueAtTime(420, at + len);
  body.Q.value = 1.4;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.55, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
  // a little breathy noise on top gives it the "rrruff" edge
  const noise = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  noise.buffer = buf;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.18;
  osc.connect(body).connect(gain).connect(ctx.destination);
  noise.connect(noiseGain).connect(body);
  osc.start(at);
  noise.start(at);
  osc.stop(at + len + 0.02);
  noise.stop(at + len + 0.02);
}

/**
 * Wraps the 404 dog so Rocky can bark. He barks by himself every few seconds (mouth opens, "WOOF!" pops up) and the sound plays
 * as soon as the browser allows it (browsers only allow sound after a tap/click) — tapping Rocky always makes him bark.
 */
export function BarkingDog({ children }: { children: ReactNode }) {
  const [barking, setBarking] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const bark = useCallback((withSound: boolean) => {
    setBarking(false);
    requestAnimationFrame(() => setBarking(true)); // restart the animation if it is already running
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setBarking(false), 1300);
    if (!withSound) return;
    try {
      const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return;
      ctx.current ??= new Ctor();
      const c = ctx.current;
      void c.resume().then(() => {
        const t = c.currentTime + 0.02;
        woof(c, t, 1);
        woof(c, t + 0.3, 1.08);
      });
    } catch {
      /* no sound available: the animation still plays */
    }
  }, []);

  useEffect(() => {
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let unlocked = false; // sound only after the visitor has tapped / pressed something
    const unlock = () => { unlocked = true; };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    const first = setTimeout(() => bark(false), 700);
    const loop = quiet ? undefined : setInterval(() => bark(unlocked), 4200);
    return () => {
      clearTimeout(first);
      clearInterval(loop);
      clearTimeout(timer.current);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void ctx.current?.close();
    };
  }, [bark]);

  return (
    <div className="text-center">
      <button type="button" onClick={() => bark(true)} className={`dog-btn mx-auto block rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${barking ? "barking" : ""}`} aria-label="Rocky the dog. Tap to make him bark">
        {children}
      </button>
      <p className="mt-1 text-sm font-semibold">Rocky</p>
      <p className="text-xs text-muted">Tap Rocky to hear him bark 🔊</p>
    </div>
  );
}
