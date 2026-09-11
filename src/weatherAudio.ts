import { getSceneAudioContext, onSceneAudioUnlock } from "./sceneAudio";
import {
  weatherHasDust,
  weatherHasRain,
  weatherHasThunder,
  weatherHasWind,
  type EnvironmentWeather,
} from "./types";
import { onThunderCue, type ThunderCue } from "./weatherEvents";

interface WeatherMixInput {
  weather: EnvironmentWeather;
  master: number;
  fadeMs: number;
}

interface Deck {
  source: AudioBufferSourceNode;
  gain: GainNode;
  src: string;
}

interface LayerTarget {
  src: string;
  volume: number;
}

const WEATHER_SFX_ROOT = "/weather-sfx";
const LIGHT_RAIN = `${WEATHER_SFX_ROOT}/light-rain.wav`;
const HEAVY_RAIN = `${WEATHER_SFX_ROOT}/heavy-rain.wav`;
const LIGHT_WIND = `${WEATHER_SFX_ROOT}/light-wind.flac`;
const HEAVY_WIND = `${WEATHER_SFX_ROOT}/heavy-wind.mp3`;
const THUNDER = Array.from(
  { length: 8 },
  (_, index) => `${WEATHER_SFX_ROOT}/thunder-${index + 1}.mp3`
);

const bufferCache = new Map<string, Promise<AudioBuffer | null>>();
const thunderTimers = new Set<number>();
const gainState = new WeakMap<GainNode, number>();

let weatherBus: GainNode | null = null;
let rainDeck: Deck | null = null;
let windDeck: Deck | null = null;
let pendingMix: WeatherMixInput | null = null;
let lastKey = "";
let mixGeneration = 0;

function ensureBus(ctx: AudioContext) {
  if (weatherBus?.context === ctx) return;
  try {
    weatherBus?.disconnect();
  } catch {
    // Already disconnected.
  }
  weatherBus = ctx.createGain();
  weatherBus.gain.setValueAtTime(1, ctx.currentTime);
  weatherBus.connect(ctx.destination);
}

function decodeSample(src: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(src);
  if (cached) return cached;
  const pending = (async () => {
    const ctx = getSceneAudioContext();
    if (!ctx) return null;
    try {
      const response = await fetch(src);
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      return await ctx.decodeAudioData(bytes.slice(0));
    } catch {
      return null;
    }
  })();
  bufferCache.set(src, pending);
  return pending;
}

function fadeTo(gain: GainNode, value: number, fadeMs: number, from?: number) {
  const ctx = gain.context;
  const now = ctx.currentTime;
  const duration = Math.max(0.05, fadeMs / 1000);
  const start = Math.max(0, from ?? gainState.get(gain) ?? gain.gain.value);
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(start, now);
  gain.gain.linearRampToValueAtTime(value, now + duration);
  gainState.set(gain, value);
}

function stopDeck(deck: Deck | null, fadeMs: number) {
  if (!deck) return;
  fadeTo(deck.gain, 0, fadeMs);
  window.setTimeout(() => {
    try {
      deck.source.stop();
      deck.source.disconnect();
      deck.gain.disconnect();
    } catch {
      // The source may already have stopped.
    }
  }, Math.max(80, fadeMs + 60));
}

async function setLayer(
  current: Deck | null,
  target: LayerTarget | null,
  fadeMs: number,
  ctx: AudioContext
): Promise<Deck | null> {
  if (!target || target.volume <= 0) {
    stopDeck(current, fadeMs);
    return null;
  }
  if (current?.src === target.src) {
    fadeTo(current.gain, target.volume, fadeMs);
    return current;
  }
  const buffer = await decodeSample(target.src);
  if (!buffer || !weatherBus || weatherBus.context !== ctx) {
    stopDeck(current, fadeMs);
    return null;
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.loop = true;
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gainState.set(gain, 0);
  source.connect(gain);
  gain.connect(weatherBus);
  source.start();
  fadeTo(gain, target.volume, fadeMs, 0);
  stopDeck(current, fadeMs);
  return { source, gain, src: target.src };
}

function layerTargets(input: WeatherMixInput) {
  const master = Math.max(0, Math.min(1, input.master));
  const rain = weatherHasRain(input.weather);
  const wind = weatherHasWind(input.weather);
  const dust = weatherHasDust(input.weather);
  const rainTarget =
    rain === "heavy"
      ? { src: HEAVY_RAIN, volume: 0.42 * master }
      : rain === "rain"
        ? { src: LIGHT_RAIN, volume: 5 * master }
        : null;
  const windTarget =
    wind === "heavy" || dust
      ? { src: HEAVY_WIND, volume: (dust ? 0.4 : 0.36) * master }
      : wind === "wind"
        ? { src: LIGHT_WIND, volume: .92 * master }
        : null;
  return { rainTarget, windTarget };
}

function cancelPendingThunder() {
  thunderTimers.forEach((timer) => window.clearTimeout(timer));
  thunderTimers.clear();
}

async function playThunder(cue: ThunderCue) {
  const input = pendingMix;
  const ctx = getSceneAudioContext();
  if (
    !input ||
    !weatherHasThunder(input.weather) ||
    input.master <= 0.01 ||
    !ctx ||
    ctx.state !== "running"
  ) {
    return;
  }
  ensureBus(ctx);
  const src = THUNDER[Math.max(0, Math.min(7, cue.sample - 1))];
  const buffer = await decodeSample(src);
  if (!buffer || !weatherBus || !weatherHasThunder(pendingMix?.weather ?? "clear")) {
    return;
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value =
    Math.max(0.18, Math.min(0.72, cue.intensity * 0.62)) *
    Math.max(0, Math.min(1, input.master));
  source.connect(gain);
  gain.connect(weatherBus);
  source.start();
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
}

async function applyWeatherMixIfReady() {
  const input = pendingMix;
  const ctx = getSceneAudioContext();
  if (!input || !ctx || ctx.state !== "running") return;
  const key = `${input.weather}|${input.master}`;
  if (key === lastKey) return;
  lastKey = key;
  const generation = ++mixGeneration;
  ensureBus(ctx);
  const { rainTarget, windTarget } = layerTargets(input);
  const fadeMs = Math.max(80, input.fadeMs);
  const [nextRain, nextWind] = await Promise.all([
    setLayer(rainDeck, rainTarget, fadeMs, ctx),
    setLayer(windDeck, windTarget, fadeMs, ctx),
  ]);
  if (generation !== mixGeneration) {
    if (nextRain && nextRain !== rainDeck) stopDeck(nextRain, 80);
    if (nextWind && nextWind !== windDeck) stopDeck(nextWind, 80);
    return;
  }
  rainDeck = nextRain;
  windDeck = nextWind;
  if (weatherHasThunder(input.weather)) {
    THUNDER.forEach((src) => void decodeSample(src));
  } else {
    cancelPendingThunder();
  }
}

export async function setWeatherMix(input: WeatherMixInput) {
  pendingMix = input;
  await applyWeatherMixIfReady();
}

onThunderCue((cue) => {
  const input = pendingMix;
  if (!input || !weatherHasThunder(input.weather)) return;
  const timer = window.setTimeout(() => {
    thunderTimers.delete(timer);
    void playThunder(cue);
  }, cue.delayMs);
  thunderTimers.add(timer);
});

onSceneAudioUnlock(() => {
  lastKey = "";
  void applyWeatherMixIfReady();
});
