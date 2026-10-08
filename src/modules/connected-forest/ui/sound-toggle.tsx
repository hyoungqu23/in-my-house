"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./game.module.css";

function chime(context: AudioContext) {
  if (context.state !== "running" || document.hidden) return;
  for (const [index, frequency] of [523.25, 659.25, 783.99].entries()) {
    const start = context.currentTime + index * .075;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(.045, start + .015);
    gain.gain.exponentialRampToValueAtTime(.001, start + .32);
    tone.connect(gain);
    gain.connect(context.destination);
    tone.start(start);
    tone.stop(start + .34);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  }
}

/** Sound starts only after a deliberate tap, never from polling or a hidden tab. */
export function ForestSoundToggle({ eventKey }: { eventKey: string }) {
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | undefined>(undefined);
  const previous = useRef(eventKey);
  useEffect(() => {
    if (previous.current !== eventKey && enabled && context.current) chime(context.current);
    previous.current = eventKey;
  }, [eventKey, enabled]);
  useEffect(() => () => { void context.current?.close(); }, []);
  return <button type="button" className={styles.sound} aria-pressed={enabled} onClick={async () => {
    if (enabled) { setEnabled(false); return; }
    if (!window.AudioContext) return;
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      setEnabled(true);
      chime(context.current);
    } catch { setEnabled(false); }
  }}>{enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{enabled ? "작은 숲 소리 끄기" : "작은 숲 소리 켜기"}</button>;
}
