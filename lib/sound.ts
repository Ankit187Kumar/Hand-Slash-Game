let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType, gainStart = 0.2, freqEnd?: number) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), c.currentTime + duration);
  }
  gain.gain.setValueAtTime(gainStart, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export const sfx = {
  slash: () => tone(900, 0.12, 'sawtooth', 0.15, 200),
  correct: () => {
    tone(660, 0.12, 'sine', 0.2, 880);
    setTimeout(() => tone(990, 0.15, 'sine', 0.2, 1320), 100);
  },
  wrong: () => tone(220, 0.3, 'square', 0.2, 80),
  countdown: () => tone(440, 0.15, 'sine', 0.2),
  go: () => tone(880, 0.3, 'sine', 0.25, 1200),
  click: () => tone(500, 0.08, 'triangle', 0.15),
  complete: () => {
    tone(523, 0.15, 'sine', 0.2, 660);
    setTimeout(() => tone(659, 0.15, 'sine', 0.2, 784), 150);
    setTimeout(() => tone(784, 0.3, 'sine', 0.2, 1046), 300);
  },
};
