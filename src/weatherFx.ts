import {
  weatherHasDust,
  weatherHasRain,
  weatherHasThunder,
  weatherHasWind,
  type EnvironmentWeather,
} from "./types";

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
  radius: number;
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
let fogSpriteReady = false;

function ensureFogSprite() {
  if (!fogSprite || !fogSpriteCtx || fogSpriteReady) return;
  const size = 256;
  fogSprite.width = size;
  fogSprite.height = size;
  const gradient = fogSpriteCtx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.12,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );
  gradient.addColorStop(0, "rgba(210, 218, 226, 1)");
  gradient.addColorStop(1, "rgba(210, 218, 226, 0)");
  fogSpriteCtx.fillStyle = gradient;
  fogSpriteCtx.fillRect(0, 0, size, size);
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

function fillFog(count: number) {
  while (state.fog.length < count) {
    state.fog.push({
      x: rand(0, state.width || 1),
      y: rand(0, state.height || 1),
      vx: rand(0.12, 0.32),
      radius: rand(90, 220),
      opacity: rand(0.35, 1),
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
        ? { color: "168, 118, 62", alpha: 0.12 }
        : rain === "heavy"
          ? { color: "28, 42, 62", alpha: 0.05 }
          : rain === "rain"
            ? { color: "36, 52, 72", alpha: 0.03 }
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
  const thunder = t > 0.45 ? to.thunder : from.thunder;
  const hazeAlpha = mix(from.haze?.alpha ?? 0, to.haze?.alpha ?? 0, t);
  const hazeColor = t > 0.5 ? to.haze?.color : from.haze?.color;

  if (hazeAlpha > 0.01 && hazeColor) {
    ctx.fillStyle = `rgba(${hazeColor}, ${hazeAlpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (fog > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(186, 198, 210, ${0.02 + fog * 0.025})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  if (reduced) {
    return thunder || rain > 0.02 || wind > 0.02 || dust > 0.02 || fog > 0.02 || t < 1;
  }

  const dropCount = Math.round(rain * (to.rainHeavy || from.rainHeavy ? 280 : 140));
  fillDrops(dropCount);
  fillMotes(state.motes, Math.round(wind * 70), 4 + wind * 8);
  fillMotes(state.dust, Math.round(dust * 140), 3 + dust * 7);
  fillFog(fog > 0.01 ? Math.round(5 + fog * 5) : 0);

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
    ctx.fillStyle = `rgba(186, 136, 72, ${0.14 + dust * 0.2})`;
    for (const mote of state.dust) {
      mote.x += mote.vx;
      mote.y += mote.vy + Math.sin(now * 0.001 + mote.y * 0.02) * 0.6;
      wrapMote(mote, width, height);
      const size = mote.size * 2.4;
      ctx.fillRect(mote.x, mote.y, size, size);
    }
    ctx.restore();
  }

  if (state.fog.length) {
    ensureFogSprite();
    ctx.save();
    for (const wisp of state.fog) {
      wisp.x += wisp.vx * (0.35 + fog);
      if (wisp.x > width + wisp.radius) wisp.x = -wisp.radius;
      ctx.globalAlpha = (0.045 + fog * 0.05) * wisp.opacity;
      const size = wisp.radius * 2;
      if (fogSprite) {
        ctx.drawImage(fogSprite, wisp.x - wisp.radius, wisp.y - wisp.radius, size, size);
      }
    }
    ctx.restore();
  }

  if (thunder) {
    if (now >= state.nextFlash) {
      state.flash = 0.55 + Math.random() * 0.4;
      state.nextFlash = now + 1800 + Math.random() * 7000;
    }
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
