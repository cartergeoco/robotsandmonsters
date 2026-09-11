import {
  weatherHasDust,
  weatherHasRain,
  weatherHasThunder,
  weatherHasWind,
  type EnvironmentWeather,
} from "./types";
import { emitThunderCue } from "./weatherEvents";

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  drift: number;
}

interface FogWisp {
  x: number;
  y: number;
  vx: number;
  width: number;
  height: number;
  opacity: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
}

interface WeatherState {
  drops: Drop[];
  motes: Mote[];
  dust: Mote[];
  fog: FogWisp[];
  flash: number;
  nextFlash: number;
  width: number;
  height: number;
}

const state: WeatherState = {
  drops: [],
  motes: [],
  dust: [],
  fog: [],
  flash: 0,
  nextFlash: 0,
  width: 0,
  height: 0,
};

const fogSprite = typeof document !== "undefined" ? document.createElement("canvas") : null;
const fogSpriteCtx = fogSprite?.getContext("2d", { alpha: true }) ?? null;
const dustFogSprite =
  typeof document !== "undefined" ? document.createElement("canvas") : null;
const dustFogSpriteCtx = dustFogSprite?.getContext("2d", { alpha: true }) ?? null;
let fogSpriteReady = false;

function paintFogSprite(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  color: [number, number, number]
) {
  const width = 512;
  const height = 96;
  canvas.width = width;
  canvas.height = height;
  const pixels = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const verticalFade = Math.sin((y / (height - 1)) * Math.PI) ** 1.8;
    for (let x = 0; x < width; x++) {
      const edgeFade = Math.sin((x / (width - 1)) * Math.PI) ** 0.7;
      const broad =
        0.62 +
        Math.sin(x * 0.021 + y * 0.045) * 0.16 +
        Math.sin(x * 0.008 - y * 0.071) * 0.12;
      const fine = Math.sin(x * 0.083 + y * 0.12) * 0.05;
      const alpha = Math.max(0, Math.min(1, (broad + fine) * verticalFade * edgeFade));
      const index = (y * width + x) * 4;
      pixels.data[index] = color[0];
      pixels.data[index + 1] = color[1];
      pixels.data[index + 2] = color[2];
      pixels.data[index + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(pixels, 0, 0);
}

function ensureFogSprites() {
  if (
    !fogSprite ||
    !fogSpriteCtx ||
    !dustFogSprite ||
    !dustFogSpriteCtx ||
    fogSpriteReady
  ) {
    return;
  }
  paintFogSprite(fogSprite, fogSpriteCtx, [205, 214, 222]);
  paintFogSprite(dustFogSprite, dustFogSpriteCtx, [166, 124, 75]);
  fogSpriteReady = true;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function resize(width: number, height: number) {
  if (state.width === width && state.height === height) return;
  state.width = width;
  state.height = height;
}

function fillDrops(count: number) {
  while (state.drops.length < count) {
    state.drops.push({
      x: rand(0, state.width || 1),
      y: rand(0, state.height || 1),
      len: rand(8, 18),
      speed: rand(16, 28),
      drift: rand(2, 6),
    });
  }
  if (state.drops.length > count) state.drops.length = count;
}

function fillMotes(list: Mote[], count: number, speed: number) {
  while (list.length < count) {
    list.push({
      x: rand(0, state.width || 1),
      y: rand(0, state.height || 1),
      vx: rand(speed * 0.5, speed),
      vy: rand(-speed * 0.12, speed * 0.12),
      size: rand(0.8, 2.4),
      life: rand(0.3, 1),
    });
  }
  if (list.length > count) list.length = count;
}

function fillDust(count: number, speed: number) {
  while (state.dust.length < count) {
    const depth = rand(0.25, 1);
    state.dust.push({
      x: rand(0, state.width || 1),
      y: rand(0, state.height || 1),
      vx: rand(speed * 0.65, speed * 1.2) * depth,
      vy: rand(-speed * 0.08, speed * 0.08),
      size: rand(0.65, 1.73) * (0.75 + depth * 0.5),
      life: rand(0.2, 0.75),
    });
  }
  if (state.dust.length > count) state.dust.length = count;
}

function fillFog(count: number) {
  while (state.fog.length < count) {
    state.fog.push({
      x: rand(-200, state.width || 1),
      y: rand((state.height || 1) * 0.46, (state.height || 1) * 0.96),
      vx: rand(0.05, 0.16),
      width: rand(360, 820),
      height: rand(38, 105),
      opacity: rand(0.22, 0.68),
    });
  }
  if (state.fog.length > count) state.fog.length = count;
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function fogAmount(weather: EnvironmentWeather): number {
  if (weather === "heavy-storm") return 1;
  if (weather === "heavy-rain") return 0.75;
  if (weather === "storm") return 0.55;
  return 0;
}

function profile(weather: EnvironmentWeather) {
  const rain = weatherHasRain(weather);
  const wind = weatherHasWind(weather);
  const fog = fogAmount(weather);
  return {
    rain: rain === "heavy" ? 1 : rain === "rain" ? 0.48 : 0,
    rainHeavy: rain === "heavy",
    wind: wind === "heavy" ? 1 : wind === "wind" ? 0.5 : 0,
    dust: weatherHasDust(weather) ? 1 : 0,
    thunder: weatherHasThunder(weather),
    fog,
    haze:
      weather === "dust-storm"
        ? { color: "151, 105, 58", alpha: 0.34 }
        : rain === "heavy"
          ? { color: "28, 42, 62", alpha: 0.12 }
          : rain === "rain"
            ? { color: "36, 52, 72", alpha: 0.05 }
            : wind === "heavy"
              ? { color: "90, 104, 118", alpha: 0.04 }
              : null,
  };
}

function wrapMote(mote: Mote, width: number, height: number) {
  if (mote.x > width + 8) mote.x = -8;
  if (mote.x < -8) mote.x = width + 8;
  if (mote.y > height + 8) mote.y = -8;
  if (mote.y < -8) mote.y = height + 8;
}

export function drawWeather(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  weather: EnvironmentWeather,
  fromWeather: EnvironmentWeather | null,
  fade: number,
  now: number,
  reduced: boolean
): boolean {
  resize(width, height);
  const to = profile(weather);
  const from = fromWeather ? profile(fromWeather) : to;
  const t = Math.max(0, Math.min(1, fade));
  const rain = mix(from.rain, to.rain, t);
  const wind = mix(from.wind, to.wind, t);
  const dust = mix(from.dust, to.dust, t);
  const fog = mix(from.fog, to.fog, t);
  const dustFog = dust * 0.72;
  const mist = Math.max(fog, dustFog);
  const thunder = t > 0.45 ? to.thunder : from.thunder;
  const hazeAlpha = mix(from.haze?.alpha ?? 0, to.haze?.alpha ?? 0, t);
  const hazeColor = t > 0.5 ? to.haze?.color : from.haze?.color;

  if (hazeAlpha > 0.01 && hazeColor) {
    ctx.fillStyle = `rgba(${hazeColor}, ${hazeAlpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (mist > 0.01) {
    ctx.save();
    ctx.fillStyle =
      dustFog > fog
        ? `rgba(142, 98, 54, ${0.022 + dustFog * 0.04})`
        : `rgba(186, 198, 210, ${0.012 + fog * 0.024})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  if (thunder && now >= state.nextFlash) {
    state.flash = 0.55 + Math.random() * 0.4;
    const distanceDelay = 180 + Math.pow(Math.random(), 0.72) * 2400;
    emitThunderCue({
      delayMs: distanceDelay,
      intensity: state.flash,
      sample: 1 + Math.floor(Math.random() * 8),
    });
    state.nextFlash = now + 6500 + Math.random() * 12_000;
  }

  if (reduced) {
    state.flash *= 0.7;
    return thunder || rain > 0.02 || wind > 0.02 || dust > 0.02 || fog > 0.02 || t < 1;
  }

  const dropCount = Math.round(rain * (to.rainHeavy || from.rainHeavy ? 280 : 140));
  fillDrops(dropCount);
  fillMotes(state.motes, Math.round(wind * 70), 4 + wind * 8);
  fillDust(Math.round(dust * 1400), 5 + dust * 5.6);
  fillFog(mist > 0.01 ? Math.round(10 + mist * 8) : 0);

  if (dropCount) {
    ctx.save();
    ctx.strokeStyle = `rgba(186, 210, 230, ${0.22 + rain * 0.28})`;
    ctx.lineWidth = rain > 0.75 ? 1.35 : 1;
    ctx.beginPath();
    for (const drop of state.drops) {
      drop.x += drop.drift * (0.4 + wind);
      drop.y += drop.speed * (0.7 + rain);
      if (drop.y > height + drop.len) {
        drop.y = -drop.len;
        drop.x = rand(-20, width + 20);
      }
      if (drop.x > width + 20) drop.x = -20;
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - drop.drift * 1.6, drop.y - drop.len * (0.8 + rain * 0.5));
    }
    ctx.stroke();
    ctx.restore();
  }

  if (state.motes.length) {
    ctx.save();
    ctx.fillStyle = `rgba(210, 220, 230, ${0.12 + wind * 0.16})`;
    for (const mote of state.motes) {
      mote.x += mote.vx;
      mote.y += mote.vy + Math.sin((now + mote.x) * 0.002) * 0.4;
      wrapMote(mote, width, height);
      ctx.fillRect(mote.x, mote.y, mote.size, mote.size * 0.4);
    }
    ctx.restore();
  }

  if (state.dust.length) {
    ctx.save();
    ctx.fillStyle = `rgba(181, 131, 64, ${0.22 + dust * 1})`;
    for (const mote of state.dust) {
      mote.x += mote.vx;
      mote.y += mote.vy + Math.sin(now * 0.0007 + mote.y * 0.018) * 0.18;
      wrapMote(mote, width, height);
      ctx.fillRect(mote.x, mote.y, mote.size, mote.size);
    }
    ctx.restore();
  }

  if (state.fog.length) {
    ensureFogSprites();
    ctx.save();
    for (const wisp of state.fog) {
      wisp.x += wisp.vx * (0.35 + mist);
      if (wisp.x > width + wisp.width * 0.5) wisp.x = -wisp.width;
      ctx.globalAlpha = (0.045 + mist * 0.075) * wisp.opacity;
      const sprite = dustFog > fog ? dustFogSprite : fogSprite;
      if (sprite) {
        ctx.drawImage(
          sprite,
          wisp.x - wisp.width * 0.5,
          wisp.y - wisp.height * 0.5,
          wisp.width,
          wisp.height
        );
      }
    }
    ctx.restore();
  }

  if (thunder) {
    if (state.flash > 0.01) {
      ctx.fillStyle = `rgba(220, 232, 255, ${state.flash * 0.42})`;
      ctx.fillRect(0, 0, width, height);
      state.flash *= 0.82;
    }
  } else {
    state.flash *= 0.7;
  }

  return (
    rain > 0.01 ||
    wind > 0.01 ||
    dust > 0.01 ||
    fog > 0.01 ||
    thunder ||
    state.flash > 0.01 ||
    t < 1
  );
}
