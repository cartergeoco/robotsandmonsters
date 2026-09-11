export interface ThunderCue {
  delayMs: number;
  intensity: number;
  sample: number;
}

const thunderListeners = new Set<(cue: ThunderCue) => void>();

export function emitThunderCue(cue: ThunderCue) {
  thunderListeners.forEach((listener) => listener(cue));
}

export function onThunderCue(listener: (cue: ThunderCue) => void) {
  thunderListeners.add(listener);
  return () => thunderListeners.delete(listener);
}
