import type { EnvironmentTrack } from "./types";

interface MixInput {
  music: EnvironmentTrack | null;
  ambience: EnvironmentTrack | null;
  musicMaster: number;
  ambienceMaster: number;
  fadeMs: number;
}

interface Deck {
  source: AudioBufferSourceNode;
  gain: GainNode;
  src: string;
}

const bufferCache = new Map<string, Promise<AudioBuffer | null>>();
const unlockHooks = new Set<() => void>();
const gainState = new WeakMap<GainNode, number>();

let audioCtx: AudioContext | null = null;
let musicBus: GainNode | null = null;
let ambienceBus: GainNode | null = null;
let musicDeck: Deck | null = null;
let ambienceDeck: Deck | null = null;
let lastMixKey = "";
let pendingMix: MixInput | null = null;
let userUnlocked = false;
let musicToken = 0;
let ambienceToken = 0;
let mixGeneration = 0;

function context(): AudioContext | null {
  const Ctor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!userUnlocked) return audioCtx;
  if (!audioCtx) {
    audioCtx = new Ctor();
    musicBus = audioCtx.createGain();
    ambienceBus = audioCtx.createGain();
    musicBus.gain.setValueAtTime(0, audioCtx.currentTime);
    ambienceBus.gain.setValueAtTime(0, audioCtx.currentTime);
    musicBus.connect(audioCtx.destination);
    ambienceBus.connect(audioCtx.destination);
    gainState.set(musicBus, 0);
    gainState.set(ambienceBus, 0);
  }
  return audioCtx;
}

function decodeTrack(src: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(src);
  if (cached) return cached;
  const pending = (async () => {
    const ctx = context();
    if (!ctx) return null;
    try {
      const response = await fetch(src);
      const bytes = await response.arrayBuffer();
      return await ctx.decodeAudioData(bytes.slice(0));
    } catch {
      return null;
    }
  })();
  bufferCache.set(src, pending);
  return pending;
}

function mixKey(input: MixInput): string {
  return [
    input.music?.src ?? "",
    input.music?.volume ?? 0,
    input.ambience?.src ?? "",
    input.ambience?.volume ?? 0,
    input.musicMaster,
    input.ambienceMaster,
  ].join("|");
}

function fadeTo(gain: GainNode, value: number, fadeMs: number, from?: number) {
  const ctx = audioCtx;
  if (!ctx) return;
  const duration = Math.max(0.05, fadeMs / 1000);
  const start = Math.max(0, from ?? gainState.get(gain) ?? 0);
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(start, now);
  gain.gain.linearRampToValueAtTime(value, now + duration);
  gainState.set(gain, value);
}

function snapTo(gain: GainNode, value: number) {
  const ctx = audioCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(value, now);
  gainState.set(gain, value);
}

function armOutputBuses() {
  if (!musicBus || !ambienceBus) return;
  if ((gainState.get(musicBus) ?? 0) >= 1) return;
  fadeTo(musicBus, 1, 80, 0);
  fadeTo(ambienceBus, 1, 80, 0);
}

function stopDeck(deck: Deck | null, fadeMs: number) {
  if (!deck || !audioCtx) return;
  fadeTo(deck.gain, 0, fadeMs);
  const source = deck.source;
  window.setTimeout(() => {
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    try {
      source.disconnect();
      deck.gain.disconnect();
    } catch {
      /* already disconnected */
    }
  }, Math.max(50, fadeMs + 40));
}

function nextToken(kind: "music" | "ambience"): number {
  return kind === "music" ? ++musicToken : ++ambienceToken;
}

function tokenNow(kind: "music" | "ambience"): number {
  return kind === "music" ? musicToken : ambienceToken;
}

async function startLayer(
  bus: GainNode | null,
  next: EnvironmentTrack | null,
  current: Deck | null,
  master: number,
  fadeMs: number,
  kind: "music" | "ambience"
): Promise<Deck | null> {
  if (!bus) return null;
  const ctx = context();
  if (!ctx || ctx.state !== "running") return current;
  const token = nextToken(kind);
  const volume = next ? Math.max(0, Math.min(1, next.volume * master)) : 0;
  if (!next?.src || volume <= 0) {
    if (token !== tokenNow(kind)) return current;
    stopDeck(current, fadeMs);
    return null;
  }
  if (current?.src === next.src) {
    if (token !== tokenNow(kind)) return current;
    fadeTo(current.gain, volume, fadeMs);
    return current;
  }
  const buffer = await decodeTrack(next.src);
  if (token !== tokenNow(kind) || !audioCtx || audioCtx.state !== "running") {
    return current;
  }
  if (!buffer) {
    stopDeck(current, fadeMs);
    return null;
  }
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = buffer;
  source.loop = true;
  snapTo(gain, 0);
  source.connect(gain);
  gain.connect(bus);
  source.start();
  fadeTo(gain, volume, fadeMs, 0);
  stopDeck(current, fadeMs);
  return { source, gain, src: next.src };
}

async function applySceneMixIfReady(): Promise<void> {
  const input = pendingMix;
  if (!input || !userUnlocked) return;
  const ctx = context();
  if (!ctx || ctx.state !== "running") return;
  const key = mixKey(input);
  if (key === lastMixKey) return;
  lastMixKey = key;
  const gen = ++mixGeneration;
  armOutputBuses();
  const fadeMs = Math.max(80, input.fadeMs);
  const nextMusic = await startLayer(
    musicBus,
    input.music,
    musicDeck,
    Math.max(0, Math.min(1, input.musicMaster)),
    fadeMs,
    "music"
  );
  if (gen !== mixGeneration) {
    if (nextMusic && nextMusic !== musicDeck) stopDeck(nextMusic, 40);
    return;
  }
  musicDeck = nextMusic;
  const nextAmbience = await startLayer(
    ambienceBus,
    input.ambience,
    ambienceDeck,
    Math.max(0, Math.min(1, input.ambienceMaster)),
    fadeMs,
    "ambience"
  );
  if (gen !== mixGeneration) {
    if (nextAmbience && nextAmbience !== ambienceDeck) stopDeck(nextAmbience, 40);
    return;
  }
  ambienceDeck = nextAmbience;
}

export async function setSceneMix(input: MixInput): Promise<void> {
  pendingMix = input;
  await applySceneMixIfReady();
}

export function getSceneAudioContext(): AudioContext | null {
  return context();
}

export function onSceneAudioUnlock(hook: () => void): () => void {
  unlockHooks.add(hook);
  return () => unlockHooks.delete(hook);
}

export function unlockSceneAudio(): void {
  userUnlocked = true;
  const ctx = context();
  if (!ctx) return;
  const flush = () => {
    if (ctx.state !== "running") return;
    void applySceneMixIfReady();
    unlockHooks.forEach((hook) => hook());
  };
  if (ctx.state === "running") {
    flush();
    return;
  }
  void ctx.resume().then(flush).catch(() => {
    /* autoplay still blocked */
  });
}
