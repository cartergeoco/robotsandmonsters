import type { EnvironmentLighting } from "./types";

export interface LightingLook {
  ground: string;
  washTop: string;
  washBottom: string;
  washAlpha: number;
  multiply: string;
  multiplyAlpha: number;
  overlay: string;
  overlayAlpha: number;
  lift: number;
  stars: number;
  fog: number;
  fogColor: string;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  r: number;
  g: number;
  b: number;
  baseAlpha: number;
  twinkle: number;
  spark: number;
  spike: boolean;
}

const LOOKS: Record<EnvironmentLighting, LightingLook> = {
  dawn: {
    ground: "52, 42, 50",
    washTop: "148, 108, 122",
    washBottom: "86, 62, 78",
    washAlpha: 0.16,
    multiply: "62, 42, 52",
    multiplyAlpha: 0.1,
    overlay: "168, 122, 132",
    overlayAlpha: 0.1,
    lift: 0,
    stars: 0.34,
    fog: 0.7,
    fogColor: "150, 158, 185",
  },
  sunrise: {
    ground: "78, 60, 48",
    washTop: "186, 132, 88",
    washBottom: "128, 78, 58",
    washAlpha: 0.18,
    multiply: "72, 48, 36",
    multiplyAlpha: 0.05,
    overlay: "199, 170, 98",
    overlayAlpha: 0.14,
    lift: 0.03,
    stars: 0.08,
    fog: 0.32,
    fogColor: "168, 150, 132",
  },
  morning: {
    ground: "92, 94, 106",
    washTop: "168, 176, 196",
    washBottom: "186, 168, 140",
    washAlpha: 0.08,
    multiply: "40, 42, 52",
    multiplyAlpha: 0,
    overlay: "188, 193, 204",
    overlayAlpha: 0.08,
    lift: 0.04,
    stars: 0,
    fog: 0.18,
    fogColor: "150, 158, 185",
  },
  noon: {
    ground: "112, 114, 126",
    washTop: "150, 158, 185",
    washBottom: "150, 158, 185",
    washAlpha: 0.04,
    multiply: "40, 42, 52",
    multiplyAlpha: 0,
    overlay: "204, 208, 214",
    overlayAlpha: 0.07,
    lift: 0.05,
    stars: 0,
    fog: 0,
    fogColor: "150, 158, 185",
  },
  midday: {
    ground: "156, 156, 162",
    washTop: "220, 218, 208",
    washBottom: "210, 206, 196",
    washAlpha: 0.05,
    multiply: "40, 42, 52",
    multiplyAlpha: 0,
    overlay: "232, 228, 214",
    overlayAlpha: 0.1,
    lift: 0.09,
    stars: 0,
    fog: 0,
    fogColor: "150, 158, 185",
  },
  dusk: {
    ground: "62, 42, 44",
    washTop: "168, 96, 72",
    washBottom: "92, 48, 62",
    washAlpha: 0.2,
    multiply: "72, 38, 42",
    multiplyAlpha: 0.12,
    overlay: "180, 110, 78",
    overlayAlpha: 0.12,
    lift: 0,
    stars: 0.12,
    fog: 0.22,
    fogColor: "128, 96, 112",
  },
  twilight: {
    ground: "34, 34, 56",
    washTop: "92, 88, 148",
    washBottom: "36, 32, 64",
    washAlpha: 0.18,
    multiply: "28, 26, 52",
    multiplyAlpha: 0.18,
    overlay: "120, 130, 164",
    overlayAlpha: 0.08,
    lift: 0,
    stars: 0.5,
    fog: 0.28,
    fogColor: "120, 130, 164",
  },
  night: {
    ground: "18, 20, 32",
    washTop: "28, 36, 64",
    washBottom: "12, 16, 28",
    washAlpha: 0.14,
    multiply: "10, 14, 26",
    multiplyAlpha: 0.28,
    overlay: "120, 130, 164",
    overlayAlpha: 0,
    lift: 0,
    stars: 0.86,
    fog: 0.36,
    fogColor: "88, 98, 128",
  },
  midnight: {
    ground: "8, 10, 16",
    washTop: "14, 18, 36",
    washBottom: "6, 8, 16",
    washAlpha: 0.16,
    multiply: "6, 8, 16",
    multiplyAlpha: 0.36,
    overlay: "88, 98, 128",
    overlayAlpha: 0,
    lift: 0,
    stars: 1,
    fog: 0.42,
    fogColor: "72, 82, 112",
  },
};

function hash(i: number, salt: number) {
  const n = Math.sin(i * salt + 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const CLUSTERS = [
  { x: 0.16, y: 0.14, s: 0.11 },
  { x: 0.48, y: 0.2, s: 0.18 },
  { x: 0.74, y: 0.12, s: 0.13 },
  { x: 0.86, y: 0.38, s: 0.09 },
  { x: 0.28, y: 0.42, s: 0.12 },
  { x: 0.08, y: 0.32, s: 0.07 },
];

function starColor(warmth: number): { r: number; g: number; b: number } {
  if (warmth < 0.16) return { r: 186, g: 208, b: 255 };
  if (warmth < 0.38) return { r: 214, g: 226, b: 255 };
  if (warmth < 0.7) return { r: 236, g: 240, b: 248 };
  if (warmth < 0.88) return { r: 255, g: 236, b: 210 };
  return { r: 255, g: 214, b: 176 };
}

function wrap01(value: number) {
  return value - Math.floor(value);
}

const STAR_COUNT = 680;
const stars: Star[] = Array.from({ length: STAR_COUNT }, (_, i) => {
  const place = hash(i, 2.17);
  let x: number;
  let y: number;
  if (place < 0.46) {
    const along = hash(i, 7.1);
    const spread = (hash(i, 1.9) - 0.5) * (0.045 + hash(i, 5.5) * 0.16);
    x = along * 1.08 - 0.04;
    y = 0.08 + along * 0.2 + spread;
  } else if (place < 0.7) {
    const cluster = CLUSTERS[Math.floor(hash(i, 8.3) * CLUSTERS.length)];
    const ang = hash(i, 6.2) * Math.PI * 2;
    const rad = Math.pow(hash(i, 3.9), 0.62) * cluster.s;
    x = cluster.x + Math.cos(ang) * rad;
    y = cluster.y + Math.sin(ang) * rad * 0.7;
  } else {
    x = hash(i, 12.9898);
    y = hash(i, 4.14159) * 0.9;
  }

  const mag = Math.pow(hash(i, 9.273), 3.8);
  const warmth = hash(i, 3.71);
  const { r, g, b } = starColor(warmth);
  const twinkleRoll = hash(i, 11.17);
  const twinkles = twinkleRoll > 0.88;
  return {
    x: wrap01(x),
    y: Math.max(0, Math.min(0.9, y)),
    size: 0.9 + mag * 4.4,
    phase: hash(i, 12.9898) * Math.PI * 2,
    speed: 0.00028 + hash(i, 15.2) * 0.0007,
    r,
    g,
    b,
    baseAlpha: 0.18 + mag * 0.82,
    twinkle: twinkles ? 0.04 + hash(i, 13.3) * 0.08 : 0,
    spark: twinkles && hash(i, 17.9) > 0.78 ? 0.12 + hash(i, 19.1) * 0.16 : 0,
    spike: mag > 0.82,
  };
});

const stillStars = stars.filter((star) => star.twinkle <= 0);
const twinkleStars = stars.filter((star) => star.twinkle > 0);

const starLayer = typeof document !== "undefined" ? document.createElement("canvas") : null;
const starLayerCtx = starLayer?.getContext("2d", { alpha: true }) ?? null;
let packedW = 0;
let packedH = 0;
let packedReduced = false;

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mixRgb(from: string, to: string, t: number) {
  const parse = (value: string) => value.split(",").map((part) => Number(part.trim()));
  const [ar, ag, ab] = parse(from);
  const [br, bg, bb] = parse(to);
  return `${Math.round(ar + (br - ar) * t)}, ${Math.round(ag + (bg - ag) * t)}, ${Math.round(ab + (bb - ab) * t)}`;
}

export function lightingLook(kind: EnvironmentLighting): LightingLook {
  return LOOKS[kind] ?? LOOKS.noon;
}

export function mixLooks(from: LightingLook, to: LightingLook, t: number): LightingLook {
  return {
    ground: mixRgb(from.ground, to.ground, t),
    washTop: mixRgb(from.washTop, to.washTop, t),
    washBottom: mixRgb(from.washBottom, to.washBottom, t),
    washAlpha: mix(from.washAlpha, to.washAlpha, t),
    multiply: mixRgb(from.multiply, to.multiply, t),
    multiplyAlpha: mix(from.multiplyAlpha, to.multiplyAlpha, t),
    overlay: mixRgb(from.overlay, to.overlay, t),
    overlayAlpha: mix(from.overlayAlpha, to.overlayAlpha, t),
    lift: mix(from.lift, to.lift, t),
    stars: mix(from.stars, to.stars, t),
    fog: mix(from.fog, to.fog, t),
    fogColor: mixRgb(from.fogColor, to.fogColor, t),
  };
}

export function lookAlongPath(path: EnvironmentLighting[], t: number): LightingLook {
  if (path.length <= 1) return lightingLook(path[0] ?? "noon");
  const segments = path.length - 1;
  const pos = Math.max(0, Math.min(1, t)) * segments;
  const index = Math.min(segments - 1, Math.floor(pos));
  return mixLooks(lightingLook(path[index]), lightingLook(path[index + 1]), pos - index);
}

function drawWash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  look: LightingLook
) {
  if (look.washAlpha <= 0.008) return;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, `rgba(${look.washTop}, ${look.washAlpha})`);
  sky.addColorStop(0.55, `rgba(${look.washBottom}, ${look.washAlpha * 0.55})`);
  sky.addColorStop(1, `rgba(${look.washBottom}, ${look.washAlpha * 0.2})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
}

function drawMultiply(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  look: LightingLook
) {
  if (look.multiplyAlpha <= 0.008) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgba(${look.multiply}, ${look.multiplyAlpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  look: LightingLook
) {
  if (look.overlayAlpha <= 0.008) return;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = `rgba(${look.overlay}, ${look.overlayAlpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawLift(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  look: LightingLook
) {
  if (look.lift <= 0.008) return;
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = `rgba(236, 232, 220, ${look.lift})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function paintStar(
  ctx: CanvasRenderingContext2D,
  star: Star,
  width: number,
  height: number,
  alpha: number
) {
  if (alpha < 0.03) return;
  const x = star.x * width;
  const y = star.y * height;
  const size = Math.max(1, star.size);
  if (size >= 2.2) {
    ctx.fillStyle = `rgba(${star.r}, ${star.g}, ${star.b}, ${alpha * 0.18})`;
    const glow = size * 2.1;
    ctx.fillRect(x - glow * 0.5, y - glow * 0.5, glow, glow);
  }
  ctx.fillStyle = `rgba(${star.r}, ${star.g}, ${star.b}, ${alpha})`;
  ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size);
  if (!star.spike || size < 2.8) return;
  const spike = size * (0.85 + alpha * 0.4);
  ctx.globalAlpha = alpha * 0.32;
  ctx.fillRect(x - spike, y - 0.5, spike * 2, 1);
  ctx.fillRect(x - 0.5, y - spike, 1, spike * 2);
  ctx.globalAlpha = 1;
}

function drawMilkyWay(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.translate(width * 0.5, height * 0.2);
  ctx.rotate(-0.22);
  const band = ctx.createLinearGradient(0, -height * 0.1, 0, height * 0.1);
  band.addColorStop(0, "rgba(168, 178, 214, 0)");
  band.addColorStop(0.5, "rgba(168, 178, 214, 0.055)");
  band.addColorStop(1, "rgba(168, 178, 214, 0)");
  ctx.fillStyle = band;
  ctx.fillRect(-width, -height * 0.12, width * 2, height * 0.24);
  ctx.restore();
}

function starAlpha(star: Star, lookStars: number, now: number, reduced: boolean) {
  let alpha = star.baseAlpha * lookStars;
  if (reduced || star.twinkle <= 0) return alpha;
  alpha *= 1 + star.twinkle * Math.sin(now * star.speed + star.phase);
  if (star.spark > 0) {
    const spark = Math.sin(now * star.speed * 1.7 + star.phase * 2.1);
    if (spark > 0.988) {
      const peak = (spark - 0.988) / 0.012;
      alpha += peak * peak * star.spark * lookStars;
    }
  }
  return Math.min(1, alpha);
}

function rebuildStarLayer(width: number, height: number, reduced: boolean) {
  if (!starLayer || !starLayerCtx) return;
  if (starLayer.width !== width) starLayer.width = Math.max(1, width);
  if (starLayer.height !== height) starLayer.height = Math.max(1, height);
  else starLayerCtx.clearRect(0, 0, width, height);
  drawMilkyWay(starLayerCtx, width, height);
  const list = reduced ? stars : stillStars;
  for (const star of list) {
    paintStar(starLayerCtx, star, width, height, star.baseAlpha);
  }
  packedW = width;
  packedH = height;
  packedReduced = reduced;
}

function drawFog(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  look: LightingLook
) {
  if (look.fog <= 0.02) return;
  const band = ctx.createLinearGradient(0, height * 0.68, 0, height);
  band.addColorStop(0, `rgba(${look.fogColor}, 0)`);
  band.addColorStop(1, `rgba(${look.fogColor}, ${0.1 * look.fog})`);
  ctx.fillStyle = band;
  ctx.fillRect(0, height * 0.68, width, height * 0.32);
}

/** Night sky only. Drawn behind maps and tokens. */
export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  look: LightingLook,
  now: number,
  reduced: boolean
): boolean {
  if (look.stars <= 0.02) return false;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (!starLayer || packedW !== w || packedH !== h || packedReduced !== reduced) {
    rebuildStarLayer(w, h, reduced);
  }
  ctx.save();
  ctx.globalAlpha = look.stars;
  if (starLayer) ctx.drawImage(starLayer, 0, 0, width, height);
  ctx.globalAlpha = 1;
  if (!reduced) {
    for (const star of twinkleStars) {
      paintStar(ctx, star, width, height, starAlpha(star, look.stars, now, false));
    }
  }
  ctx.restore();
  return !reduced && twinkleStars.length > 0;
}

/** Time-of-day grade over the finished scene. Does not include stars. */
export function drawLightingOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  look: LightingLook
) {
  ctx.save();
  drawWash(ctx, width, height, look);
  drawMultiply(ctx, width, height, look);
  drawOverlay(ctx, width, height, look);
  drawLift(ctx, width, height, look);
  drawFog(ctx, width, height, look);
  ctx.restore();
}
