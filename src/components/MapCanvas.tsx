import {
  Copy,
  Dices,
  Eye,
  EyeOff,
  Heart,
  HeartOff,
  HeartPulse,
  Hexagon,
  PackagePlus,
  Pencil,
  ShieldPlus,
  Skull,
  Swords,
  Trash2,
  UserMinus,
} from "lucide-react";
import type { RollResult } from "react-ttrpg-dice";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRAM } from "../store";
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_OPACITY,
  DEFAULT_VISUAL_SCALE,
  FEET_PER_CELL,
  assignEquipmentSlots,
  calculateCreatureStats,
  formatMod,
  STATUS_EFFECT_PRESETS,
  TOKEN_FLOATER_MS,
  normalizeGridOpacity,
  normalizeVisualScale,
  realHp,
  rectangularTokenBounds,
  statusEffectColor,
  temporaryHp,
  tokenDisplayName,
  type MapBackground,
  type MapToken,
  type PC,
  type SaveArea,
  type TokenKind,
  type StatusEffect,
  type TokenCell,
  type TokenFloater,
  type TokenIntent,
} from "../types";
import {
  checkOptionsFor,
  creatureCanRollChecks,
  DEFAULT_CHECK_ID,
  findCheckOption,
  type CheckId,
} from "../checks";
import { d20FromResult, requestD20Roll, requestD20Rolls } from "../diceRolls";
import {
  activeCombatant,
  canJoinCombat,
  combatantSpeed,
  FOCUS_CREATURE_EVENT,
  initiativeModifier,
  isInCombat,
  movementBudget,
} from "../combat";
import {
  applyDeathSaveRoll,
  applyHpChange,
  creatureUsesDeathSaves,
  deathConditionLabel,
  deathSaveState,
  dropToDeathSaves,
  healFully,
} from "../deathSaves";
import {
  concealCreature,
  isConcealed,
  occupiedWorldCells,
  partyCanPerceive,
  revealCreature,
} from "../perception";
import {
  drawLightingOverlay,
  drawStarfield,
  lightingLook,
  lookAlongPath,
  type LightingLook,
} from "../lightingFx";
import { drawWeather } from "../weatherFx";
import { RamButton, RamConfirmDialog, RamInput, RamSelect } from "./ui/RamPrimitives";
import { itemRarityClassName, itemRarityStyle } from "./ItemName";

function mapCellPx() {
  return DEFAULT_GRID_SIZE;
}

function mapGridOpacity() {
  return normalizeGridOpacity(
    useRAM.getState().uiSettings.gridOpacity ?? DEFAULT_GRID_OPACITY
  ) / 100;
}

const IDLE_PCS: PC[] = [];
const IDLE_TOKENS: MapToken[] = [];

function onlyPositionChanged<T extends { id: string; x: number; y: number }>(
  prev: T[],
  next: T[]
): boolean {
  if (prev.length !== next.length) return false;
  const prior = new Map(prev.map((entry) => [entry.id, entry]));
  for (const entry of next) {
    const last = prior.get(entry.id);
    if (!last) return false;
    if (last === entry) continue;
    for (const key of Object.keys(entry) as (keyof T)[]) {
      if (key === "x" || key === "y") continue;
      if (entry[key] !== last[key]) return false;
    }
  }
  return true;
}

function colorWithAlpha(color: string, alpha: number): string {
  const rgba = color.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const [r, g, b] = rgba[1].split(",").map((part) => part.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const hex = color.replace("#", "");
  if (hex.length === 3 || hex.length === 6) {
    const full = hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function rgbLuminance(rgb: string): number {
  const [r = 0, g = 0, b = 0] = rgb
    .split(",")
    .map((part) => Number(part.trim()) / 255);
  const linear = (value: number) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Drop alpha so a token plate can never be a see-through wash. */
function opaqueCssColor(color: string): string {
  const rgba = color.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const [r, g, b] = rgba[1].split(",").map((part) => part.trim());
    return `rgb(${r}, ${g}, ${b})`;
  }
  return color;
}

function resetCompositing(ctx: CanvasRenderingContext2D) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
}

function glazeTokenPlate(ctx: CanvasRenderingContext2D, look: LightingLook) {
  if (look.multiplyAlpha > 0.008) {
    ctx.fillStyle = `rgba(${look.multiply}, ${Math.min(1, look.multiplyAlpha)})`;
    ctx.fill();
  }
  if (look.washAlpha > 0.008) {
    ctx.fillStyle = `rgba(${look.washBottom}, ${Math.min(1, look.washAlpha * 0.4)})`;
    ctx.fill();
  }
}

const MAP_DEFAULTS = {
  grid: "rgba(132, 141, 169, 0.06)",
  gridMajor: "rgba(132, 141, 169, 0.11)",
  axis: "rgba(120, 129, 164, 0.22)",
  label: "rgba(156, 164, 188, 0.78)",
  rulerLabel: "rgba(156, 164, 188, 0.5)",
  hoverFill: "rgba(116, 125, 159, 0.06)",
  hoverStroke: "rgba(133, 142, 177, 0.25)",
  background: "#11131a",
  accent: "#949cbb",
  named: "#c7aa62",
};
const MIN_GRID_PX = 10;
const MIN_LABEL_PX = 44;
const RULER_TOP = 16;
const RULER_LEFT = 40;
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 24;
const MIN_FRAME_MS = 1000 / 60;
const STAR_FRAME_MS = 240;
/** Matches the battle vignette's ram-battle-in duration. */
const AC_FADE_MS = 420;

interface Draggable {
  id: string;
  isPC: boolean;
  x: number;
  y: number;
  color: string;
  name: string;
  named: boolean;
  image?: string;
  hpFrac?: number;
  tempFrac?: number;
  ac?: number;
  statuses: StatusEffect[];
  width: number;
  height: number;
  bounds: TokenCell[];
  kind: "pc" | MapToken["kind"];
  visualScale: number;
  unseenByParty?: boolean;
  selected?: boolean;
  dead?: boolean;
  dying?: boolean;
  deathSuccesses?: number;
  deathFailures?: number;
}

interface TokenContextMenu {
  id: string;
  isPC: boolean;
  x: number;
  y: number;
}

interface MapCellMenu {
  cellX: number;
  cellY: number;
  x: number;
  y: number;
}

interface IntentMenu {
  creatureId: string;
  intentId: string;
  x: number;
  y: number;
}

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [contextMenu, setContextMenu] = useState<TokenContextMenu | null>(null);
  const [cellMenu, setCellMenu] = useState<MapCellMenu | null>(null);
  const [intentMenu, setIntentMenu] = useState<IntentMenu | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    isPC: boolean;
    name: string;
  } | null>(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const selectedEntityIdsRef = useRef(new Set<string>());
  const selectionNeedsPublish = useRef(false);
  const [confirmGroupDelete, setConfirmGroupDelete] = useState(false);
  const [effectId, setEffectId] = useState<
    (typeof STATUS_EFFECT_PRESETS)[number]["id"]
  >(STATUS_EFFECT_PRESETS[0].id);
  const [amount, setAmount] = useState(1);
  const [libraryItemId, setLibraryItemId] = useState("");
  const [rollFor, setRollFor] = useState<CheckId>(DEFAULT_CHECK_ID);
  const libraryItems = useRAM((state) => state.customLibraryItems);
  const rules = useRAM((state) => state.ruleDefinitions);
  const pcs = useRAM((state) =>
    contextMenu || intentMenu ? state.pcs : IDLE_PCS
  );
  const mapTokens = useRAM((state) => (contextMenu ? state.tokens : IDLE_TOKENS));
  const tokenIntents = useRAM((state) => state.tokenIntents);
  const combat = useRAM((state) => state.combat);
  const selectedSaveAreaId = useRAM((state) => state.selectedSaveAreaId);
  const confirmDeletes = useRAM((state) => state.uiSettings.confirmDeletes);
  const saveAreas = useRAM((state) => state.saveAreas);
  const selectedSaveArea = saveAreas.find((area) => area.id === selectedSaveAreaId);
  const sortedLibraryItems = useMemo(
    () => [...libraryItems].sort((a, b) => a.name.localeCompare(b.name)),
    [libraryItems]
  );

  function updateMapSelection(ids: Iterable<string>, render = true) {
    const next = [...new Set(ids)];
    selectedEntityIdsRef.current = new Set(next);
    if (render) {
      selectionNeedsPublish.current = false;
      setSelectedEntityIds(next);
    } else {
      selectionNeedsPublish.current = true;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    const camera = { x: 0, y: 0, zoom: 1 };
    let persistCameraTimer = 0;
    let cameraReady = false;
    let cameraInitialized = false;

    function writeCamera() {
      if (!cameraReady) return;
      useRAM.getState().setMapCamera({
        x: camera.x,
        y: camera.y,
        zoom: camera.zoom,
      });
    }

    function persistCamera() {
      if (!cameraReady) return;
      window.clearTimeout(persistCameraTimer);
      persistCameraTimer = window.setTimeout(writeCamera, 120);
    }
    const pointer = { x: 0, y: 0, inside: false };
    const pan = { active: false, lastX: 0, lastY: 0 };
    const marquee = {
      active: false,
      startX: 0,
      startY: 0,
      x: 0,
      y: 0,
      additive: false,
    };
    const drag = {
      active: false,
      id: "",
      isPC: false,
      offX: 0,
      offY: 0,
      x: 0,
      y: 0,
      startX: 0,
      startY: 0,
    };
    let tokenCache: Draggable[] | null = null;
    let intentHits: Array<{
      creatureId: string;
      intentId: string;
      left: number;
      top: number;
      width: number;
      height: number;
    }> = [];
    const paint = {
      active: false,
      add: true,
      visited: new Set<string>(),
    };

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let raf = 0;
    let frameTimer = 0;
    let lastFrameAt = 0;
    let starTimer = 0;
    let hoverCellX = 0;
    let hoverCellY = 0;
    let hasHover = false;
    let disposed = false;
    let colors = { ...MAP_DEFAULTS };
    let colorsReady = false;
    let uiFont = "Lekton, monospace";
    let sceneDirty = true;
    let sceneCacheValid = false;
    const acOpacity = new Map<string, number>();
    let lastAcFadeAt = 0;
    let pendingAfterRender: (() => void) | null = null;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const imageCache = new Map<string, HTMLImageElement>();
    const imageLuminanceCache = new WeakMap<HTMLImageElement, number>();
    const tokenSprite = document.createElement("canvas");
    const tokenSpriteCtx = tokenSprite.getContext("2d", { alpha: true });
    const sceneCache = document.createElement("canvas");
    const sceneCacheCtx = sceneCache.getContext("2d", { alpha: false });

    function paintImageToken(
      img: HTMLImageElement,
      drawLeft: number,
      drawTop: number,
      drawSize: number,
      look: LightingLook | undefined,
      dead?: boolean,
      unseenByParty?: boolean
    ) {
      const size = Math.max(1, Math.ceil(drawSize));
      if (tokenSprite.width !== size || tokenSprite.height !== size) {
        tokenSprite.width = size;
        tokenSprite.height = size;
      } else {
        tokenSpriteCtx!.clearRect(0, 0, size, size);
      }
      const sctx = tokenSpriteCtx!;
      resetCompositing(sctx);
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = pan.active || drag.active ? "low" : "medium";
      if (dead) {
        sctx.filter = "grayscale(0.85) brightness(0.78)";
      } else if (unseenByParty) {
        sctx.filter = "saturate(0.45) brightness(1.08)";
      }
      const imageRatio = img.naturalWidth / img.naturalHeight;
      const drawWidth = imageRatio > 1 ? size * imageRatio : size;
      const drawHeight = imageRatio > 1 ? size : size / imageRatio;
      sctx.drawImage(img, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
      sctx.filter = "none";
      if (look) {
        sctx.globalCompositeOperation = "source-atop";
        sctx.beginPath();
        sctx.rect(0, 0, size, size);
        glazeTokenPlate(sctx, look);
        sctx.globalCompositeOperation = "source-over";
      }
      ctx!.drawImage(tokenSprite, drawLeft, drawTop, drawSize, drawSize);
    }

    function readMapColors() {
      if (colorsReady) return;
      const rootStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      const value = (name: string, fallback: string) =>
        rootStyle.getPropertyValue(name).trim() || fallback;
      colors = {
        grid: value("--map-grid", MAP_DEFAULTS.grid),
        gridMajor: value("--map-grid-major", MAP_DEFAULTS.gridMajor),
        axis: value("--map-axis", MAP_DEFAULTS.axis),
        label: value("--map-label", MAP_DEFAULTS.label),
        rulerLabel: value("--map-ruler-label", MAP_DEFAULTS.rulerLabel),
        hoverFill: value("--map-hover-fill", MAP_DEFAULTS.hoverFill),
        hoverStroke: value("--map-hover-stroke", MAP_DEFAULTS.hoverStroke),
        background: bodyStyle.backgroundColor || MAP_DEFAULTS.background,
        accent: value("--ram-accent-bright", MAP_DEFAULTS.accent),
        named: value("--ram-named", MAP_DEFAULTS.named),
      };
      uiFont = bodyStyle.fontFamily || uiFont;
      colorsReady = true;
    }

    function getImage(src: string): HTMLImageElement | null {
      let img = imageCache.get(src);
      if (!img) {
        img = new Image();
        img.src = src;
        img.onload = () => schedule();
        imageCache.set(src, img);
      }
      return img.complete && img.naturalWidth > 0 ? img : null;
    }

    function imageLuminance(img: HTMLImageElement): number {
      const cached = imageLuminanceCache.get(img);
      if (cached !== undefined) return cached;
      let luminance = 0.5;
      try {
        const sample = document.createElement("canvas");
        sample.width = 16;
        sample.height = 16;
        const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
        sampleCtx?.drawImage(img, 0, 0, sample.width, sample.height);
        const pixels = sampleCtx?.getImageData(0, 0, sample.width, sample.height).data;
        if (pixels) {
          let total = 0;
          let weight = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const alpha = pixels[i + 3] / 255;
            if (alpha <= 0.02) continue;
            total +=
              rgbLuminance(`${pixels[i]}, ${pixels[i + 1]}, ${pixels[i + 2]}`) *
              alpha;
            weight += alpha;
          }
          if (weight > 0) luminance = total / weight;
        }
      } catch {
        // Cross-origin maps fall back to the current sky luminance.
      }
      imageLuminanceCache.set(img, luminance);
      return luminance;
    }

    function buildTokens(): Draggable[] {
      const s = useRAM.getState();
      const list: Draggable[] = [];
      const perceptionRadius = s.settings.perceptionRadius;
      const rules = s.ruleDefinitions;
      const items = s.customLibraryItems;
      for (const t of s.tokens) {
        const saves = t.deathSaves;
        list.push({
          id: t.id,
          isPC: false,
          x: t.x,
          y: t.y,
          color: t.color,
          name: tokenDisplayName(t),
          named: Boolean(t.givenName.trim()),
          image: t.image,
          ac: t.kind === "object" ? undefined : t.ac,
          hpFrac:
            t.maxHp && t.maxHp > 0 && t.hp !== undefined
              ? realHp(t.hp, t.maxHp) / Math.max(t.maxHp, t.hp, 1)
              : undefined,
          tempFrac:
            t.maxHp && t.maxHp > 0 && t.hp !== undefined
              ? temporaryHp(t.hp, t.maxHp) / Math.max(t.maxHp, t.hp, 1)
              : undefined,
          statuses: t.statuses ?? [],
          kind: t.kind,
          visualScale: normalizeVisualScale(t.visualScale ?? DEFAULT_VISUAL_SCALE),
          unseenByParty: !partyCanPerceive(
            s.pcs,
            t,
            rules,
            items,
            perceptionRadius
          ),
          width: t.width,
          height: t.height,
          bounds: t.bounds?.length ? t.bounds : rectangularTokenBounds(t.width, t.height),
          dead: Boolean(saves?.dead),
          dying: t.hp <= 0 && !saves?.dead && !saves?.stable && (t.maxHp ?? 0) > 0,
          deathSuccesses: saves?.successes ?? 0,
          deathFailures: saves?.failures ?? 0,
          selected: selectedEntityIdsRef.current.has(t.id),
        });
      }
      for (const p of s.pcs) {
        const saves = p.deathSaves;
        list.push({
          id: p.id,
          isPC: true,
          x: p.x,
          y: p.y,
          color: p.color,
          name: p.name,
          named: false,
          image: p.image,
          ac: p.ac,
          hpFrac:
            p.maxHp > 0 || p.hp > 0
              ? realHp(p.hp, p.maxHp) / Math.max(p.maxHp, p.hp, 1)
              : undefined,
          tempFrac:
            p.maxHp > 0 || p.hp > 0
              ? temporaryHp(p.hp, p.maxHp) / Math.max(p.maxHp, p.hp, 1)
              : undefined,
          statuses: p.statuses ?? [],
          kind: "pc",
          visualScale: normalizeVisualScale(p.visualScale ?? DEFAULT_VISUAL_SCALE),
          unseenByParty: !partyCanPerceive(
            s.pcs.filter((member) => member.id !== p.id),
            p,
            rules,
            items,
            perceptionRadius
          ),
          width: p.width,
          height: p.height,
          bounds: p.bounds?.length ? p.bounds : rectangularTokenBounds(p.width, p.height),
          selected: p.id === s.selectedPcId || selectedEntityIdsRef.current.has(p.id),
          dead: Boolean(saves?.dead),
          dying: p.hp <= 0 && !saves?.dead && !saves?.stable,
          deathSuccesses: saves?.successes ?? 0,
          deathFailures: saves?.failures ?? 0,
        });
      }
      return list;
    }

    function tokens(): Draggable[] {
      if (!tokenCache) tokenCache = buildTokens();
      if (!drag.active) return tokenCache;
      const dx = drag.x - drag.startX;
      const dy = drag.y - drag.startY;
      return tokenCache.map((entry) =>
        selectedEntityIdsRef.current.has(entry.id)
          ? { ...entry, x: entry.x + dx, y: entry.y + dy, selected: true }
          : entry.id === drag.id
            ? { ...entry, x: drag.x, y: drag.y }
            : entry
      );
    }

    function syncTokenSelectionFlags() {
      if (!tokenCache) return;
      const selected = selectedEntityIdsRef.current;
      const selectedPc = useRAM.getState().selectedPcId;
      for (const entry of tokenCache) {
        entry.selected =
          selected.has(entry.id) || (entry.isPC && entry.id === selectedPc);
      }
    }

    function applyTokenFocus(hit: { id: string; isPC: boolean }) {
      const live = useRAM.getState();
      if (hit.isPC) {
        if (hit.id !== live.selectedPcId) live.selectPC(hit.id);
      } else if (live.selectedPcId) {
        live.selectPC(null);
      }
      if (
        live.tokenManagerOpen &&
        live.tokenManagerTab === "map" &&
        live.tokenManagerTokenId !== hit.id
      ) {
        live.setTokenManagerOpen(false);
      }
    }

    function snapCell(value: number) {
      return useRAM.getState().uiSettings.snapToGrid !== false
        ? Math.round(value)
        : value;
    }

    function schedule(dirty = true) {
      if (dirty) {
        sceneDirty = true;
      }
      if (raf || frameTimer || disposed) return;
      const delay = MIN_FRAME_MS - (performance.now() - lastFrameAt);
      if (delay > 1) {
        frameTimer = window.setTimeout(() => {
          frameTimer = 0;
          if (!disposed) raf = requestAnimationFrame(render);
        }, delay);
      } else {
        raf = requestAnimationFrame(render);
      }
    }

    const hair = (v: number) => (Math.round(v * dpr) + 0.5) / dpr;

    function stepForMin(cellPx: number, minPx: number): number {
      let mag = 1;
      for (;;) {
        for (const m of [1, 2, 5]) {
          if (cellPx * m * mag >= minPx) return m * mag;
        }
        mag *= 10;
      }
    }

    const toWorld = (sx: number, sy: number) => ({
      x: sx / camera.zoom + camera.x,
      y: sy / camera.zoom + camera.y,
    });

    function tokenAt(sx: number, sy: number): Draggable | null {
      const w = toWorld(sx, sy);
      const list = tokens();
      for (let i = list.length - 1; i >= 0; i--) {
        const t = list[i];
        const inside = t.bounds.some((cell) => {
          const left = (t.x + cell.x) * mapCellPx();
          const top = (t.y + cell.y) * mapCellPx();
          return (
            w.x >= left &&
            w.x <= left + mapCellPx() &&
            w.y >= top &&
            w.y <= top + mapCellPx()
          );
        });
        if (inside) {
          return t;
        }
      }
      return null;
    }

    function resize() {
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.parentElement!.getBoundingClientRect();
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      if (nextW === cssW && nextH === cssH && nextDpr === dpr) return;
      cssW = nextW;
      cssH = nextH;
      dpr = nextDpr;
      canvas!.width = Math.max(1, Math.round(cssW * dpr));
      canvas!.height = Math.max(1, Math.round(cssH * dpr));
      sceneCache.width = canvas!.width;
      sceneCache.height = canvas!.height;
      sceneCacheValid = false;
      schedule();
    }

    function drawToken(t: Draggable, zoom: number, look?: LightingLook) {
      const xs = t.bounds.map((cell) => cell.x);
      const ys = t.bounds.map((cell) => cell.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const footprintLeft = ((t.x + minX) * mapCellPx() - camera.x) * zoom;
      const footprintTop = ((t.y + minY) * mapCellPx() - camera.y) * zoom;
      const footprintWidth = (maxX - minX + 1) * mapCellPx() * zoom;
      const footprintHeight = (maxY - minY + 1) * mapCellPx() * zoom;
      if (
        footprintLeft > cssW ||
        footprintTop > cssH ||
        footprintLeft + footprintWidth < 0 ||
        footprintTop + footprintHeight < 0
      ) {
        return;
      }

      const cellSize = mapCellPx() * zoom;
      const inset = Math.max(2, cellSize * 0.08);
      const artLeft = (t.x * mapCellPx() - camera.x) * zoom + inset;
      const artTop = (t.y * mapCellPx() - camera.y) * zoom + inset;
      const artSize = Math.max(2, cellSize - inset * 2);
      const visualScale = t.visualScale || 1;
      const drawSize = artSize * visualScale;
      const radius = drawSize * 0.12;
      const cx = artLeft + artSize / 2;
      const cy = artTop + artSize / 2;
      const drawLeft = cx - drawSize / 2;
      const drawTop = cy - drawSize / 2;
      const img = t.image ? getImage(t.image) : null;

      ctx!.save();
      resetCompositing(ctx!);
      if (img && tokenSpriteCtx) {
        paintImageToken(
          img,
          drawLeft,
          drawTop,
          drawSize,
          look,
          t.dead,
          t.unseenByParty
        );
      } else if (!t.image) {
        ctx!.beginPath();
        ctx!.roundRect(drawLeft, drawTop, drawSize, drawSize, radius);
        ctx!.fillStyle = opaqueCssColor(t.color);
        ctx!.fill();
        if (look) glazeTokenPlate(ctx!, look);
      }
      ctx!.restore();

      if (!t.image) {
        ctx!.save();
        ctx!.strokeStyle = t.unseenByParty ? "rgba(141, 167, 255, 0.9)" : t.color;
        ctx!.lineWidth = Math.max(1, 1.5 * zoom);
        for (const cell of t.bounds) {
          const cellLeft = ((t.x + cell.x) * mapCellPx() - camera.x) * zoom + inset;
          const cellTop = ((t.y + cell.y) * mapCellPx() - camera.y) * zoom + inset;
          ctx!.beginPath();
          ctx!.roundRect(
            cellLeft,
            cellTop,
            Math.max(2, cellSize - inset * 2),
            Math.max(2, cellSize - inset * 2),
            Math.max(1, cellSize * 0.08)
          );
          ctx!.stroke();
        }
        ctx!.restore();
      }

      if (t.dead && artSize > 14) {
        const iconR = Math.max(5, Math.min(9, drawSize * 0.16));
        const ix = drawLeft + drawSize - iconR - 1;
        const iy = drawTop + iconR + 1;
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(ix, iy, iconR, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(17, 19, 26, 0.82)";
        ctx!.fill();
        ctx!.strokeStyle = "rgba(240, 139, 139, 0.95)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
        ctx!.fillStyle = "rgba(240, 139, 139, 0.95)";
        ctx!.font = `700 ${Math.max(8, iconR + 2)}px ${uiFont}`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillText("†", ix, iy + 0.5);
        ctx!.restore();
      } else if (t.unseenByParty && artSize > 14) {
        const iconR = Math.max(5, Math.min(9, drawSize * 0.16));
        const ix = drawLeft + drawSize - iconR - 1;
        const iy = drawTop + iconR + 1;
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(ix, iy, iconR, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(17, 19, 26, 0.78)";
        ctx!.fill();
        ctx!.strokeStyle = "rgba(141, 167, 255, 0.95)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
        ctx!.strokeStyle = "rgba(210, 220, 255, 0.95)";
        ctx!.lineWidth = Math.max(1.2, zoom);
        ctx!.beginPath();
        ctx!.ellipse(ix, iy, iconR * 0.55, iconR * 0.32, 0, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.arc(ix, iy, iconR * 0.16, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(ix - iconR * 0.55, iy + iconR * 0.55);
        ctx!.lineTo(ix + iconR * 0.55, iy - iconR * 0.55);
        ctx!.stroke();
        ctx!.restore();
      }

      if (artSize > 18 && t.statuses.length > 0) {
        const visibleStatuses = t.statuses.slice(0, 7);
        const dotRadius = Math.max(2.5, Math.min(5, artSize * 0.09));
        const gap = dotRadius * 2 + 2;
        const startX = cx - ((visibleStatuses.length - 1) * gap) / 2;
        const y = drawTop + dotRadius + 3;
        ctx!.save();
        visibleStatuses.forEach((status, index) => {
          ctx!.beginPath();
          ctx!.arc(startX + index * gap, y, dotRadius, 0, Math.PI * 2);
          ctx!.fillStyle = statusEffectColor(status);
          ctx!.fill();
          ctx!.strokeStyle = "rgba(17, 19, 26, 0.9)";
          ctx!.lineWidth = 1;
          ctx!.stroke();
        });
        ctx!.restore();
      }

      if (t.selected) {
        const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
        const rectangular = t.bounds.length === cellCount;
        ctx!.save();
        ctx!.strokeStyle = colors.accent;
        ctx!.lineWidth = Math.max(1.2, 1.5 * zoom);
        if (rectangular) {
          ctx!.beginPath();
          ctx!.roundRect(
            footprintLeft + inset * 0.35,
            footprintTop + inset * 0.35,
            Math.max(2, footprintWidth - inset * 0.7),
            Math.max(2, footprintHeight - inset * 0.7),
            Math.max(1, cellSize * 0.08)
          );
          ctx!.stroke();
        } else {
          for (const cell of t.bounds) {
            const cellLeft = ((t.x + cell.x) * mapCellPx() - camera.x) * zoom + inset * 0.35;
            const cellTop = ((t.y + cell.y) * mapCellPx() - camera.y) * zoom + inset * 0.35;
            ctx!.beginPath();
            ctx!.roundRect(
              cellLeft,
              cellTop,
              Math.max(2, cellSize - inset * 0.7),
              Math.max(2, cellSize - inset * 0.7),
              Math.max(1, cellSize * 0.08)
            );
            ctx!.stroke();
          }
        }
        ctx!.restore();
      }

      if (artSize > 24) {
        ctx!.fillStyle = t.named ? colors.named : colors.label;
        ctx!.font = `${t.named ? "italic " : ""}400 ${Math.max(12, 10 * Math.min(zoom, 1.4))}px ${uiFont}`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "top";
        ctx!.fillText(t.name, cx, footprintTop + footprintHeight + 3);
        if (t.hpFrac !== undefined) {
          const bw = Math.min(artSize * 0.72, mapCellPx() * 1.8 * zoom);
          const bh = 3;
          const by =
            footprintTop + footprintHeight + (10 * Math.min(zoom, 1.4) + 7);
          ctx!.fillStyle = "rgba(255,255,255,0.10)";
          ctx!.fillRect(cx - bw / 2, by, bw, bh);
          const realWidth = bw * (t.hpFrac ?? 0);
          ctx!.fillStyle =
            (t.hpFrac ?? 0) + (t.tempFrac ?? 0) > 0.5
              ? "#637c79"
              : (t.hpFrac ?? 0) > 0.25
                ? "#747d9f"
                : "#765462";
          ctx!.fillRect(cx - bw / 2, by, realWidth, bh);
          if ((t.tempFrac ?? 0) > 0) {
            ctx!.fillStyle = "#4d8fd6";
            ctx!.fillRect(cx - bw / 2 + realWidth, by, bw * t.tempFrac!, bh);
          }
        }
        if (t.dying || t.dead) {
          const pipR = Math.max(2, Math.min(3.5, artSize * 0.07));
          const pipY = footprintTop + footprintHeight + (t.hpFrac !== undefined ? 22 : 16);
          ctx!.save();
          for (let i = 0; i < 3; i++) {
            ctx!.beginPath();
            ctx!.arc(cx - 18 + i * 7, pipY, pipR, 0, Math.PI * 2);
            ctx!.fillStyle =
              i < (t.deathSuccesses ?? 0) ? "#9ee4b2" : "rgba(255,255,255,0.16)";
            ctx!.fill();
          }
          for (let i = 0; i < 3; i++) {
            ctx!.beginPath();
            ctx!.arc(cx + 4 + i * 7, pipY, pipR, 0, Math.PI * 2);
            ctx!.fillStyle =
              i < (t.deathFailures ?? 0) || t.dead ? "#f08b8b" : "rgba(255,255,255,0.16)";
            ctx!.fill();
          }
          ctx!.restore();
        }
      }
    }

    function drawAcBadge(t: Draggable, zoom: number, alpha: number) {
      if (alpha <= 0.01 || t.ac === undefined) return;
      const xs = t.bounds.map((cell) => cell.x);
      const ys = t.bounds.map((cell) => cell.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const footprintLeft = ((t.x + minX) * mapCellPx() - camera.x) * zoom;
      const footprintTop = ((t.y + minY) * mapCellPx() - camera.y) * zoom;
      const footprintWidth = (maxX - minX + 1) * mapCellPx() * zoom;
      const footprintHeight = (maxY - minY + 1) * mapCellPx() * zoom;
      if (
        footprintLeft > cssW ||
        footprintTop > cssH ||
        footprintLeft + footprintWidth < 0 ||
        footprintTop + footprintHeight < 0
      ) {
        return;
      }
      const cellSize = mapCellPx() * zoom;
      const inset = Math.max(2, cellSize * 0.08);
      const artSize = Math.max(2, cellSize - inset * 2);
      if (artSize <= 16) return;
      const acText = String(t.ac);
      const fontSize = Math.max(10, Math.min(15, cellSize * 0.26));
      ctx!.save();
      ctx!.globalAlpha = alpha;
      ctx!.font = `600 ${fontSize}px ${uiFont}`;
      ctx!.textAlign = "left";
      ctx!.textBaseline = "middle";
      const padX = Math.max(3, fontSize * 0.35);
      const padY = Math.max(2, fontSize * 0.22);
      const textW = ctx!.measureText(acText).width;
      const badgeW = textW + padX * 2;
      const badgeH = fontSize + padY * 2;
      const badgeX = footprintLeft + Math.max(2, inset * 0.4);
      const badgeY = footprintTop + footprintHeight - badgeH - Math.max(2, inset * 0.4);
      ctx!.beginPath();
      ctx!.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
      ctx!.fillStyle = "rgba(12, 13, 18, 0.78)";
      ctx!.fill();
      ctx!.fillStyle = "rgba(232, 236, 246, 0.95)";
      ctx!.fillText(acText, badgeX + padX, badgeY + badgeH / 2 + 0.5);
      ctx!.restore();
    }

    /**
     * AC badges live on the overlay so they can fade without rebuilding the
     * scene cache. Only combatants are targeted; everyone else eases out.
     */
    function drawCombatAcBadges(
      list: Draggable[],
      zoom: number,
      combatIds: Set<string>,
      reducedMotion: boolean,
      dt: number
    ): boolean {
      let busy = false;
      const seen = new Set<string>();
      for (const t of list) {
        if (t.ac === undefined) continue;
        seen.add(t.id);
        const want = combatIds.has(t.id) ? 1 : 0;
        let cur = acOpacity.get(t.id) ?? 0;
        if (reducedMotion) cur = want;
        else if (cur < want) {
          cur = Math.min(want, cur + dt / AC_FADE_MS);
          if (cur < want) busy = true;
        } else if (cur > want) {
          cur = Math.max(want, cur - dt / AC_FADE_MS);
          if (cur > want) busy = true;
        }
        if (cur <= 0.01) {
          acOpacity.delete(t.id);
          continue;
        }
        acOpacity.set(t.id, cur);
        drawAcBadge(t, zoom, cur);
      }
      for (const id of [...acOpacity.keys()]) {
        if (!seen.has(id)) acOpacity.delete(id);
      }
      return busy;
    }

    /** Strict combat refuses over-budget moves, so warn before the drop. */
    function snapGhostRefused(t: Draggable, snapX: number, snapY: number): boolean {
      const state = useRAM.getState();
      if (state.gameplaySettings.combatRules !== "strict") return false;
      const active = activeCombatant(state.combat);
      if (!active || active.id !== t.id) return false;
      const creature = active.isPC
        ? state.pcs.find((pc) => pc.id === active.id)
        : state.tokens.find((token) => token.id === active.id);
      if (!creature) return false;
      const budget = movementBudget(
        active,
        combatantSpeed(creature, state.ruleDefinitions, state.customLibraryItems)
      );
      const feet =
        Math.max(Math.abs(creature.x - snapX), Math.abs(creature.y - snapY)) *
        FEET_PER_CELL;
      return feet > budget.remaining;
    }

    function drawSnapGhost(t: Draggable, snapX: number, snapY: number, zoom: number) {
      if (Math.abs(t.x - snapX) < 0.02 && Math.abs(t.y - snapY) < 0.02) return;
      const cellSize = mapCellPx() * zoom;
      const inset = Math.max(2, cellSize * 0.08);
      const refused = snapGhostRefused(t, snapX, snapY);
      ctx!.save();
      ctx!.setLineDash([4, 4]);
      ctx!.strokeStyle = refused
        ? "rgba(240, 139, 139, 0.85)"
        : colorWithAlpha(t.color, 0.7);
      ctx!.lineWidth = Math.max(1, 1.4 * zoom);
      for (const cell of t.bounds) {
        const cellLeft = ((snapX + cell.x) * mapCellPx() - camera.x) * zoom + inset;
        const cellTop = ((snapY + cell.y) * mapCellPx() - camera.y) * zoom + inset;
        ctx!.beginPath();
        ctx!.roundRect(
          cellLeft,
          cellTop,
          Math.max(2, cellSize - inset * 2),
          Math.max(2, cellSize - inset * 2),
          Math.max(1, cellSize * 0.08)
        );
        ctx!.stroke();
      }
      ctx!.restore();
    }

    /**
     * BG3-style reach preview: a filled square of cells the active combatant
     * can still walk to, plus a dashed outline for what a Dash would add.
     * Chebyshev radius, matching how `distanceFeet` prices a move.
     */
    function drawMovementRange(t: Draggable, zoom: number) {
      const state = useRAM.getState();
      if (state.gameplaySettings.combatRules === "off") return;
      const active = activeCombatant(state.combat);
      if (!active || active.id !== t.id) return;
      const creature = active.isPC
        ? state.pcs.find((pc) => pc.id === active.id)
        : state.tokens.find((token) => token.id === active.id);
      if (!creature) return;
      const speed = combatantSpeed(
        creature,
        state.ruleDefinitions,
        state.customLibraryItems
      );
      if (speed <= 0) return;
      const walk = movementBudget(active, speed);
      const dash = movementBudget({ ...active, dashes: active.dashes + 1 }, speed);
      if (dash.cells <= 0) return;

      const cell = mapCellPx() * zoom;
      const span = (radius: number) => ({
        left: ((t.x - radius) * mapCellPx() - camera.x) * zoom,
        top: ((t.y - radius) * mapCellPx() - camera.y) * zoom,
        width: (radius * 2 + t.width) * cell,
        height: (radius * 2 + t.height) * cell,
      });

      ctx!.save();
      if (walk.cells > 0) {
        const box = span(walk.cells);
        ctx!.fillStyle = colorWithAlpha(colors.accent, 0.09);
        ctx!.strokeStyle = colorWithAlpha(colors.accent, 0.5);
        ctx!.lineWidth = Math.max(1, 1.4 * zoom);
        ctx!.fillRect(box.left, box.top, box.width, box.height);
        ctx!.strokeRect(hair(box.left), hair(box.top), box.width, box.height);
      }
      if (dash.cells > walk.cells) {
        const box = span(dash.cells);
        ctx!.setLineDash([6, 5]);
        ctx!.strokeStyle = colorWithAlpha(colors.accent, 0.3);
        ctx!.lineWidth = 1;
        ctx!.strokeRect(hair(box.left), hair(box.top), box.width, box.height);
      }
      ctx!.restore();
    }

    function drawSaveAreas(areas: SaveArea[], selectedId: string | null, zoom: number) {
      const cell = mapCellPx() * zoom;
      for (const area of areas) {
        const selected = area.id === selectedId;
        ctx!.save();
        ctx!.fillStyle = colorWithAlpha(area.color, selected ? 0.28 : 0.16);
        ctx!.strokeStyle = colorWithAlpha(area.color, selected ? 0.95 : 0.55);
        ctx!.lineWidth = selected ? Math.max(1.5, 1.8 * zoom) : 1;
        for (const occupied of area.cells) {
          const left = (occupied.x * mapCellPx() - camera.x) * zoom;
          const top = (occupied.y * mapCellPx() - camera.y) * zoom;
          ctx!.fillRect(left, top, cell, cell);
          ctx!.strokeRect(hair(left), hair(top), cell, cell);
        }
        if (selected && area.cells.length) {
          const xs = area.cells.map((entry) => entry.x);
          const ys = area.cells.map((entry) => entry.y);
          const labelX =
            ((Math.min(...xs) + Math.max(...xs) + 1) * 0.5 * mapCellPx() - camera.x) *
            zoom;
          const labelY = (Math.min(...ys) * mapCellPx() - camera.y) * zoom - 6;
          ctx!.fillStyle = area.color;
          ctx!.font = `600 ${Math.max(10, 11 * Math.min(zoom, 1.4))}px ${uiFont}`;
          ctx!.textAlign = "center";
          ctx!.textBaseline = "bottom";
          ctx!.fillText(`${area.name}  DC ${area.dc}`, labelX, labelY);
        }
        ctx!.restore();
      }
    }

    function drawFloaters(
      floaters: TokenFloater[],
      list: Draggable[],
      zoom: number,
      now: number
    ) {
      let alive = false;
      const stackByCreature = new Map<string, number>();
      ctx!.save();
      ctx!.textAlign = "center";
      ctx!.textBaseline = "bottom";
      for (const floater of floaters) {
        const age = now - floater.bornAt;
        if (age < 0 || age > TOKEN_FLOATER_MS) continue;
        alive = true;
        const token = list.find((entry) => entry.id === floater.creatureId);
        if (!token) continue;
        const t = age / TOKEN_FLOATER_MS;
        const rise = (1 - Math.pow(1 - t, 2)) * 28 * Math.min(zoom, 1.6);
        const fade =
          t < 0.12 ? t / 0.12 : t > 0.62 ? Math.max(0, 1 - (t - 0.62) / 0.38) : 1;
        const stack = stackByCreature.get(floater.creatureId) ?? 0;
        stackByCreature.set(floater.creatureId, stack + 1);
        const extra = stack * 16 * Math.min(zoom, 1.4);
        const cx = (token.x * mapCellPx() - camera.x) * zoom + (mapCellPx() * zoom) / 2;
        const cy =
          (token.y * mapCellPx() - camera.y) * zoom -
          8 * Math.min(zoom, 1.4) -
          rise -
          extra;
        const tone =
          floater.color ||
          (floater.outcome === "success"
            ? "#9ee4b2"
            : floater.outcome === "fail"
              ? "#f08b8b"
              : "#e2c56e");
        ctx!.globalAlpha = fade;
        ctx!.font = `700 ${Math.max(11, 12 * Math.min(zoom, 1.5))}px ${uiFont}`;
        ctx!.lineWidth = 3;
        ctx!.strokeStyle = "rgba(10, 12, 18, 0.78)";
        ctx!.fillStyle = tone;
        ctx!.strokeText(floater.title, cx, cy);
        ctx!.fillText(floater.title, cx, cy);
        if (floater.detail.trim()) {
          ctx!.font = `600 ${Math.max(10, 11 * Math.min(zoom, 1.4))}px ${uiFont}`;
          ctx!.fillStyle = "rgba(244, 246, 252, 0.95)";
          ctx!.strokeText(floater.detail, cx, cy + 14 * Math.min(zoom, 1.4));
          ctx!.fillText(floater.detail, cx, cy + 14 * Math.min(zoom, 1.4));
        }
      }
      ctx!.restore();
      return alive;
    }

    function drawIntents(intents: TokenIntent[], list: Draggable[], zoom: number) {
      intentHits = [];
      const stackByCreature = new Map<string, number>();
      ctx!.save();
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      for (const intent of intents) {
        if (intent.status !== "pending") continue;
        const token = list.find(
          (entry) => entry.isPC && entry.id === intent.creatureId
        );
        if (!token) continue;
        const stack = stackByCreature.get(intent.creatureId) ?? 0;
        stackByCreature.set(intent.creatureId, stack + 1);
        const title = intent.title.slice(0, 24);
        const detail =
          intent.detail.length > 54 ? `${intent.detail.slice(0, 53)}…` : intent.detail;
        const fontScale = Math.min(zoom, 1.25);
        ctx!.font = `700 ${Math.max(10, 11 * fontScale)}px ${uiFont}`;
        const width = Math.max(
          96,
          Math.min(
            260,
            Math.max(ctx!.measureText(title).width, ctx!.measureText(detail).width) + 22
          )
        );
        const height = detail ? 42 : 27;
        const cx =
          (token.x * mapCellPx() - camera.x) * zoom +
          (token.width * mapCellPx() * zoom) / 2;
        const bottom =
          (token.y * mapCellPx() - camera.y) * zoom - 12 - stack * (height + 10);
        const left = cx - width / 2;
        const top = bottom - height;
        ctx!.fillStyle = "rgba(18, 20, 28, 0.94)";
        ctx!.strokeStyle = token.color;
        ctx!.lineWidth = 1.5;
        ctx!.beginPath();
        ctx!.roundRect(left, top, width, height, 8);
        ctx!.fill();
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(cx - 7, bottom);
        ctx!.lineTo(cx, bottom + 8);
        ctx!.lineTo(cx + 7, bottom);
        ctx!.closePath();
        ctx!.fill();
        ctx!.stroke();
        ctx!.fillStyle = token.color;
        ctx!.fillText(title, cx, top + 13);
        if (detail) {
          ctx!.font = `500 ${Math.max(9, 10 * fontScale)}px ${uiFont}`;
          ctx!.fillStyle = "rgba(245, 246, 250, 0.96)";
          ctx!.fillText(detail, cx, top + 29);
        }
        intentHits.push({
          creatureId: intent.creatureId,
          intentId: intent.id,
          left,
          top,
          width,
          height: height + 8,
        });
      }
      ctx!.restore();
    }

    function intentAt(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return (
        [...intentHits]
          .reverse()
          .find(
            (hit) =>
              x >= hit.left &&
              x <= hit.left + hit.width &&
              y >= hit.top &&
              y <= hit.top + hit.height
          ) ?? null
      );
    }

    function render() {
      raf = 0;
      if (disposed) return;
      lastFrameAt = performance.now();
      const state = useRAM.getState();
      readMapColors();

      if (pointer.inside && !pan.active && !drag.active && !paint.active) {
        const w = toWorld(pointer.x, pointer.y);
        hoverCellX = Math.floor(w.x / mapCellPx());
        hoverCellY = Math.floor(w.y / mapCellPx());
        hasHover = true;
      } else {
        hasHover = false;
      }

      const zoom = camera.zoom;
      const now = Date.now();
      const cellPx = mapCellPx() * zoom;
      const transition = state.sceneTransition;
      const lightingTransition = state.lightingTransition;
      const weatherTransition = state.weatherTransition;
      const fade = transition
        ? Math.max(
            0,
            Math.min(1, (now - transition.startedAt) / Math.max(1, transition.durationMs))
          )
        : 1;
      const lightingFade = lightingTransition
        ? Math.max(
            0,
            Math.min(
              1,
              (now - lightingTransition.startedAt) /
                Math.max(1, lightingTransition.durationMs)
            )
          )
        : 1;
      const weatherFade = weatherTransition
        ? Math.max(
            0,
            Math.min(
              1,
              (now - weatherTransition.startedAt) /
                Math.max(1, weatherTransition.durationMs)
            )
          )
        : 1;
      const lighting = lightingTransition?.path.length
        ? lookAlongPath(lightingTransition.path, lightingFade)
        : lightingLook(state.lighting);
      const currentMapImage = state.background ? getImage(state.background.src) : null;
      const backdropLuminance = currentMapImage
        ? imageLuminance(currentMapImage)
        : rgbLuminance(lighting.ground);
      const lightBackdrop = backdropLuminance > 0.22;
      const gridTone = lightBackdrop ? "18, 22, 30" : "224, 230, 242";
      const labelTone = lightBackdrop ? "12, 16, 24" : "232, 236, 246";
      const reducedMotion =
        state.uiSettings.motion === "reduced" ||
        (state.uiSettings.motion === "system" && motionQuery.matches);
      const sceneAnimating =
        (Boolean(transition) && fade < 1) ||
        (Boolean(lightingTransition) && lightingFade < 1) ||
        (Boolean(weatherTransition) && weatherFade < 1);
      if (sceneAnimating) sceneDirty = true;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      resetCompositing(ctx!);

      function mapScreenRect(background: MapBackground | null) {
        if (!background) return null;
        const img = getImage(background.src);
        if (!img) return null;
        const s = background.scale * zoom;
        return {
          x: -camera.x * zoom,
          y: -camera.y * zoom,
          w: img.naturalWidth * s,
          h: img.naturalHeight * s,
        };
      }

      function drawMap(background: MapBackground | null, alpha: number) {
        const rect = mapScreenRect(background);
        if (!rect || alpha <= 0) return;
        const img = getImage(background!.src);
        if (!img) return;
        ctx!.save();
        ctx!.globalAlpha = alpha;
        ctx!.imageSmoothingEnabled = true;
        ctx!.imageSmoothingQuality = pan.active ? "low" : "medium";
        ctx!.fillStyle = "#1c1e26";
        ctx!.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx!.drawImage(img, rect.x, rect.y, rect.w, rect.h);
        ctx!.restore();
      }

      function gradeMappedAreas() {
        const rects = [
          fade < 1 ? mapScreenRect(transition?.fromBackground ?? null) : null,
          mapScreenRect(state.background),
        ];
        let graded = false;
        for (const rect of rects) {
          if (!rect) continue;
          ctx!.save();
          ctx!.beginPath();
          ctx!.rect(rect.x, rect.y, rect.w, rect.h);
          ctx!.clip();
          drawLightingOverlay(ctx!, cssW, cssH, lighting);
          ctx!.restore();
          graded = true;
        }
        return graded;
      }

      const useCache = !sceneDirty && sceneCacheValid && sceneCache.width > 0;
      let starsBusy =
        state.uiSettings.lightingEffects !== false &&
        !reducedMotion &&
        lighting.stars > 0.02;
      if (useCache) {
        ctx!.setTransform(1, 0, 0, 1, 0, 0);
        ctx!.drawImage(sceneCache, 0, 0);
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else {
        ctx!.fillStyle = `rgb(${lighting.ground})`;
        ctx!.fillRect(0, 0, cssW, cssH);
        drawLightingOverlay(ctx!, cssW, cssH, lighting);
        resetCompositing(ctx!);
        starsBusy =
          state.uiSettings.lightingEffects !== false
            ? drawStarfield(ctx!, cssW, cssH, lighting, now, reducedMotion)
            : false;

        if (fade < 1 && transition?.fromBackground) {
          drawMap(transition.fromBackground, 1 - fade);
        }
        drawMap(state.background, fade);

        drawSaveAreas(state.saveAreas ?? [], state.selectedSaveAreaId, zoom);

        gradeMappedAreas();
        resetCompositing(ctx!);

        const gridStep = stepForMin(cellPx, MIN_GRID_PX);
        const worldRight = camera.x + cssW / zoom;
        const worldBottom = camera.y + cssH / zoom;
        const colStart = Math.floor(camera.x / mapCellPx() / gridStep) * gridStep;
        const colEnd = Math.floor(worldRight / mapCellPx());
        const rowStart = Math.floor(camera.y / mapCellPx() / gridStep) * gridStep;
        const rowEnd = Math.floor(worldBottom / mapCellPx());
        const gridOpacity = mapGridOpacity();

        if (hasHover) {
          const hx = (hoverCellX * mapCellPx() - camera.x) * zoom;
          const hy = (hoverCellY * mapCellPx() - camera.y) * zoom;
          const hoverFill = Math.max(0.08, gridOpacity * 0.22);
          const hoverStroke = Math.max(0.28, gridOpacity * 0.7);
          ctx!.fillStyle = `rgba(${gridTone}, ${hoverFill})`;
          ctx!.fillRect(hx, hy, cellPx, cellPx);
          ctx!.strokeStyle = `rgba(${gridTone}, ${hoverStroke})`;
          ctx!.lineWidth = 1;
          ctx!.strokeRect(hair(hx), hair(hy), cellPx, cellPx);
        }

        if (gridOpacity > 0) {
          ctx!.strokeStyle = `rgba(${gridTone}, ${gridOpacity * 0.62})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          for (let col = colStart; col <= colEnd; col += gridStep) {
            const x = hair((col * mapCellPx() - camera.x) * zoom);
            ctx!.moveTo(x, 0);
            ctx!.lineTo(x, cssH);
          }
          for (let row = rowStart; row <= rowEnd; row += gridStep) {
            const y = hair((row * mapCellPx() - camera.y) * zoom);
            ctx!.moveTo(0, y);
            ctx!.lineTo(cssW, y);
          }
          ctx!.stroke();

          const majorStep = gridStep * 5;
          const majorColStart = Math.floor(camera.x / mapCellPx() / majorStep) * majorStep;
          const majorRowStart = Math.floor(camera.y / mapCellPx() / majorStep) * majorStep;
          ctx!.strokeStyle = `rgba(${gridTone}, ${gridOpacity * 0.92})`;
          ctx!.beginPath();
          for (let col = majorColStart; col <= colEnd; col += majorStep) {
            const x = hair((col * mapCellPx() - camera.x) * zoom);
            ctx!.moveTo(x, 0);
            ctx!.lineTo(x, cssH);
          }
          for (let row = majorRowStart; row <= rowEnd; row += majorStep) {
            const y = hair((row * mapCellPx() - camera.y) * zoom);
            ctx!.moveTo(0, y);
            ctx!.lineTo(cssW, y);
          }
          ctx!.stroke();

          const originX = hair(-camera.x * zoom);
          const originY = hair(-camera.y * zoom);
          ctx!.strokeStyle = `rgba(${gridTone}, ${Math.min(1, gridOpacity)})`;
          ctx!.beginPath();
          if (originX >= 0 && originX <= cssW) {
            ctx!.moveTo(originX, 0);
            ctx!.lineTo(originX, cssH);
          }
          if (originY >= 0 && originY <= cssH) {
            ctx!.moveTo(0, originY);
            ctx!.lineTo(cssW, originY);
          }
          ctx!.stroke();
        }

        const rangeToken = tokens().find((entry) =>
          selectedEntityIdsRef.current.has(entry.id)
        );
        if (rangeToken) drawMovementRange(rangeToken, zoom);

        if (fade < 1 && transition?.fromTokens.length) {
          ctx!.save();
          ctx!.globalAlpha = 1 - fade;
          for (const token of transition.fromTokens) {
            drawToken(
              {
                id: token.id,
                isPC: false,
                x: token.x,
                y: token.y,
                color: token.color,
                name: tokenDisplayName(token),
                named: Boolean(token.givenName.trim()),
                image: token.image,
                statuses: token.statuses ?? [],
                kind: token.kind,
                visualScale: normalizeVisualScale(token.visualScale ?? DEFAULT_VISUAL_SCALE),
                width: token.width,
                height: token.height,
                bounds: token.bounds?.length
                  ? token.bounds
                  : rectangularTokenBounds(token.width, token.height),
              },
              zoom,
              lighting
            );
          }
          ctx!.restore();
          resetCompositing(ctx!);
        }
        const sceneTokens = tokens();
        const draggingIds = drag.active
          ? selectedEntityIdsRef.current.size
            ? selectedEntityIdsRef.current
            : new Set([drag.id])
          : null;
        ctx!.save();
        if (fade < 1) ctx!.globalAlpha = fade;
        for (const t of sceneTokens) {
          if (draggingIds?.has(t.id) || t.isPC) continue;
          drawToken(t, zoom, lighting);
        }
        ctx!.restore();
        resetCompositing(ctx!);
        for (const t of sceneTokens) {
          if (draggingIds?.has(t.id) || !t.isPC) continue;
          drawToken(t, zoom, lighting);
        }
        if (sceneCacheCtx && (drag.active || starsBusy || weatherTransition || state.weather !== "clear")) {
          sceneCacheCtx.setTransform(1, 0, 0, 1, 0, 0);
          sceneCacheCtx.drawImage(canvas!, 0, 0);
          sceneCacheValid = true;
        } else {
          sceneCacheValid = false;
        }
        sceneDirty = false;
      }

      const liveTokens = tokens();
      if (drag.active) {
        const draggingIds = selectedEntityIdsRef.current.size
          ? selectedEntityIdsRef.current
          : new Set([drag.id]);
        for (const t of liveTokens) {
          if (draggingIds.has(t.id)) drawToken(t, zoom, lighting);
        }
        const dragged = liveTokens.find((entry) => entry.id === drag.id);
        if (dragged) {
          drawSnapGhost(dragged, Math.round(drag.x), Math.round(drag.y), zoom);
        }
      }

      const acNow = performance.now();
      const acDt = Math.min(AC_FADE_MS, lastAcFadeAt ? acNow - lastAcFadeAt : 16);
      lastAcFadeAt = acNow;
      const combatIds = new Set(
        (state.combat?.combatants ?? []).map((combatant) => combatant.id)
      );
      const acBusy = drawCombatAcBadges(
        liveTokens,
        zoom,
        combatIds,
        reducedMotion,
        acDt
      );

      const weatherBusy =
        state.uiSettings.weatherEffects === false
          ? false
          : drawWeather(
              ctx!,
              cssW,
              cssH,
              state.weather,
              weatherTransition?.fromWeather ?? null,
              weatherFade,
              now,
              reducedMotion
            );
      const floatersBusy = drawFloaters(
        state.tokenFloaters ?? [],
        liveTokens,
        zoom,
        now
      );
      drawIntents(state.tokenIntents ?? [], liveTokens, zoom);
      if (marquee.active) {
        const left = Math.min(marquee.startX, marquee.x);
        const top = Math.min(marquee.startY, marquee.y);
        const width = Math.abs(marquee.x - marquee.startX);
        const height = Math.abs(marquee.y - marquee.startY);
        ctx!.save();
        ctx!.fillStyle = "rgba(148, 156, 187, 0.12)";
        ctx!.strokeStyle = "rgba(148, 156, 187, 0.8)";
        ctx!.lineWidth = 1;
        ctx!.setLineDash([5, 4]);
        ctx!.fillRect(left, top, width, height);
        ctx!.strokeRect(left, top, width, height);
        ctx!.restore();
      }

      const labelStep = stepForMin(cellPx, MIN_LABEL_PX);
      const worldRight = camera.x + cssW / zoom;
      const worldBottom = camera.y + cssH / zoom;
      const colEnd = Math.floor(worldRight / mapCellPx());
      const rowEnd = Math.floor(worldBottom / mapCellPx());
      ctx!.fillStyle = colors.background;
      ctx!.fillRect(0, 0, cssW, RULER_TOP);
      ctx!.fillRect(0, 0, RULER_LEFT, cssH);
      ctx!.strokeStyle = `rgba(${gridTone}, 0.3)`;
      ctx!.beginPath();
      ctx!.moveTo(hair(RULER_LEFT), RULER_TOP);
      ctx!.lineTo(hair(RULER_LEFT), cssH);
      ctx!.moveTo(RULER_LEFT, hair(RULER_TOP));
      ctx!.lineTo(cssW, hair(RULER_TOP));
      ctx!.stroke();

      ctx!.fillStyle = `rgba(${labelTone}, 0.72)`;
      ctx!.font = "400 12px 'Lekton', monospace";
      ctx!.textBaseline = "middle";
      const labelColStart = Math.floor(camera.x / mapCellPx() / labelStep) * labelStep;
      const labelRowStart = Math.floor(camera.y / mapCellPx() / labelStep) * labelStep;

      ctx!.textAlign = "center";
      for (let col = labelColStart; col <= colEnd; col += labelStep) {
        const x = (col * mapCellPx() - camera.x) * zoom + cellPx * 0.5;
        if (x < RULER_LEFT - 4 || x > cssW + 4) continue;
        ctx!.fillText(String(col), x, RULER_TOP * 0.5);
      }
      ctx!.textAlign = "right";
      for (let row = labelRowStart; row <= rowEnd; row += labelStep) {
        const y = (row * mapCellPx() - camera.y) * zoom + cellPx * 0.5;
        if (y < RULER_TOP - 4 || y > cssH + 4) continue;
        ctx!.fillText(String(row), RULER_LEFT - 6, y);
      }
      ctx!.fillStyle = colors.background;
      ctx!.fillRect(0, 0, RULER_LEFT, RULER_TOP);

      if (sceneAnimating) schedule(true);
      if (weatherBusy || floatersBusy || acBusy) schedule(false);
      if (starsBusy && !starTimer) {
        starTimer = window.setTimeout(() => {
          starTimer = 0;
          if (!disposed) schedule(!drag.active);
        }, STAR_FRAME_MS);
      }
      if (pendingAfterRender) {
        const after = pendingAfterRender;
        pendingAfterRender = null;
        requestAnimationFrame(after);
      }
    }

    function onPointerMove(e: PointerEvent) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (pan.active) {
        camera.x -= (e.clientX - pan.lastX) / camera.zoom;
        camera.y -= (e.clientY - pan.lastY) / camera.zoom;
        pan.lastX = e.clientX;
        pan.lastY = e.clientY;
        persistCamera();
        schedule();
        return;
      }

      if (paint.active) {
        const w = toWorld(e.clientX, e.clientY);
        const cx = Math.floor(w.x / mapCellPx());
        const cy = Math.floor(w.y / mapCellPx());
        const key = `${cx}:${cy}`;
        if (!paint.visited.has(key)) {
          paint.visited.add(key);
          const state = useRAM.getState();
          if (state.selectedSaveAreaId) {
            state.setSaveAreaCell(state.selectedSaveAreaId, cx, cy, paint.add);
          }
        }
        schedule();
        return;
      }

      if (marquee.active) {
        marquee.x = e.clientX;
        marquee.y = e.clientY;
        schedule();
        return;
      }

      if (drag.active) {
        const w = toWorld(e.clientX, e.clientY);
        drag.x = w.x / mapCellPx() - drag.offX;
        drag.y = w.y / mapCellPx() - drag.offY;
        schedule(!sceneCacheValid);
        return;
      }

      canvas!.classList.toggle(
        "token-hover",
        tokenAt(e.clientX, e.clientY) !== null || intentAt(e.clientX, e.clientY) !== null
      );
      const world = toWorld(e.clientX, e.clientY);
      const nextHoverX = Math.floor(world.x / mapCellPx());
      const nextHoverY = Math.floor(world.y / mapCellPx());
      if (hasHover && nextHoverX === hoverCellX && nextHoverY === hoverCellY) return;
      schedule();
    }

    function onPointerDown(e: PointerEvent) {
      setContextMenu((current) => (current ? null : current));
      setCellMenu((current) => (current ? null : current));
      setIntentMenu((current) => (current ? null : current));
      if (e.button === 1) {
        e.preventDefault();
        pan.active = true;
        pan.lastX = e.clientX;
        pan.lastY = e.clientY;
        canvas!.classList.add("panning");
        try {
          canvas!.setPointerCapture(e.pointerId);
        } catch {
          /* best-effort */
        }
        schedule();
        return;
      }
      if (e.button === 0) {
        const intent = intentAt(e.clientX, e.clientY);
        if (intent) {
          e.preventDefault();
          e.stopPropagation();
          setIntentMenu({
            creatureId: intent.creatureId,
            intentId: intent.intentId,
            x: e.clientX,
            y: e.clientY,
          });
          return;
        }
        const hit = tokenAt(e.clientX, e.clientY);
        if (hit) {
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            const next = new Set(selectedEntityIdsRef.current);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
            updateMapSelection(next);
            syncTokenSelectionFlags();
            schedule();
            return;
          }
          if (!selectedEntityIdsRef.current.has(hit.id)) {
            updateMapSelection([hit.id], false);
            syncTokenSelectionFlags();
          }
          const w = toWorld(e.clientX, e.clientY);
          drag.active = true;
          drag.id = hit.id;
          drag.isPC = hit.isPC;
          drag.offX = w.x / mapCellPx() - hit.x;
          drag.offY = w.y / mapCellPx() - hit.y;
          drag.x = hit.x;
          drag.y = hit.y;
          drag.startX = hit.x;
          drag.startY = hit.y;
          sceneCacheValid = false;
          sceneDirty = true;
          canvas!.classList.add("token-dragging");
          try {
            canvas!.setPointerCapture(e.pointerId);
          } catch {
            /* best-effort */
          }
        } else {
          const state = useRAM.getState();
          if (
            !e.ctrlKey &&
            !e.metaKey &&
            !e.shiftKey &&
            (state.selectedPcId ||
              (state.tokenManagerOpen && state.tokenManagerTab === "map") ||
              selectedEntityIdsRef.current.size)
          ) {
            updateMapSelection([]);
            if (state.selectedPcId) state.selectPC(null);
            if (state.tokenManagerOpen && state.tokenManagerTab === "map") {
              state.setTokenManagerOpen(false);
            }
            syncTokenSelectionFlags();
          }
          if (!state.selectedSaveAreaId) {
            marquee.active = true;
            marquee.startX = e.clientX;
            marquee.startY = e.clientY;
            marquee.x = e.clientX;
            marquee.y = e.clientY;
            marquee.additive = e.ctrlKey || e.metaKey || e.shiftKey;
            try {
              canvas!.setPointerCapture(e.pointerId);
            } catch {
              /* best-effort */
            }
          }
          if (state.selectedSaveAreaId) {
            const w = toWorld(e.clientX, e.clientY);
            const cx = Math.floor(w.x / mapCellPx());
            const cy = Math.floor(w.y / mapCellPx());
            const area = state.saveAreas.find(
              (entry) => entry.id === state.selectedSaveAreaId
            );
            const has = area?.cells.some((cell) => cell.x === cx && cell.y === cy);
            paint.active = true;
            paint.add = !has;
            paint.visited = new Set([`${cx}:${cy}`]);
            state.setSaveAreaCell(state.selectedSaveAreaId, cx, cy, paint.add);
            try {
              canvas!.setPointerCapture(e.pointerId);
            } catch {
              /* best-effort */
            }
          }
        }
      }
    }

    function endInteraction(e: PointerEvent) {
      if (pan.active) {
        pan.active = false;
        canvas!.classList.remove("panning");
      }
      if (drag.active) {
        const dx = drag.x - drag.startX;
        const dy = drag.y - drag.startY;
        const selected = selectedEntityIdsRef.current;
        const group = (tokenCache ?? []).filter((entry) => selected.has(entry.id));
        const moves =
          group.length > 1
            ? group.map((entry) => ({
                id: entry.id,
                isPC: entry.isPC,
                x: snapCell(entry.x + dx),
                y: snapCell(entry.y + dy),
              }))
            : [
                {
                  id: drag.id,
                  isPC: drag.isPC,
                  x: snapCell(drag.x),
                  y: snapCell(drag.y),
                },
              ];
        if (tokenCache) {
          const byId = new Map(moves.map((move) => [move.id, move]));
          for (const entry of tokenCache) {
            const move = byId.get(entry.id);
            if (!move) continue;
            entry.x = move.x;
            entry.y = move.y;
            entry.selected = true;
          }
        }
        const focus = { id: drag.id, isPC: drag.isPC };
        drag.active = false;
        canvas!.classList.remove("token-dragging");
        sceneCacheValid = false;
        pendingAfterRender = () => {
          if (disposed) return;
          useRAM.getState().moveCreatures(moves);
          applyTokenFocus(focus);
          if (selectionNeedsPublish.current) {
            selectionNeedsPublish.current = false;
            setSelectedEntityIds([...selected]);
          }
        };
      }
      if (marquee.active) {
        const left = Math.min(marquee.startX, marquee.x);
        const top = Math.min(marquee.startY, marquee.y);
        const right = Math.max(marquee.startX, marquee.x);
        const bottom = Math.max(marquee.startY, marquee.y);
        const clickOnly = right - left < 6 && bottom - top < 6;
        if (clickOnly && !marquee.additive) {
          updateMapSelection([]);
          const state = useRAM.getState();
          if (state.selectedPcId) state.selectPC(null);
          if (state.tokenManagerOpen && state.tokenManagerTab === "map") {
            state.setTokenManagerOpen(false);
          }
        } else {
          const selected = new Set(marquee.additive ? selectedEntityIdsRef.current : []);
          for (const entry of tokens()) {
            const tokenLeft = (entry.x * mapCellPx() - camera.x) * camera.zoom;
            const tokenTop = (entry.y * mapCellPx() - camera.y) * camera.zoom;
            const tokenRight = tokenLeft + entry.width * mapCellPx() * camera.zoom;
            const tokenBottom = tokenTop + entry.height * mapCellPx() * camera.zoom;
            if (
              tokenRight >= left &&
              tokenLeft <= right &&
              tokenBottom >= top &&
              tokenTop <= bottom
            ) {
              selected.add(entry.id);
            }
          }
          updateMapSelection(selected);
          if (!selected.size) {
            const state = useRAM.getState();
            if (state.selectedPcId) state.selectPC(null);
            if (state.tokenManagerOpen && state.tokenManagerTab === "map") {
              state.setTokenManagerOpen(false);
            }
          }
        }
        tokenCache = null;
        marquee.active = false;
      }
      paint.active = false;
      paint.visited.clear();
      if (canvas!.hasPointerCapture(e.pointerId)) {
        canvas!.releasePointerCapture(e.pointerId);
      }
      schedule();
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= cssH;
      const w = toWorld(e.clientX, e.clientY);
      const next = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, camera.zoom * Math.exp(-dy * 0.0018))
      );
      if (next === camera.zoom) return;
      camera.zoom = next;
      camera.x = w.x - e.clientX / camera.zoom;
      camera.y = w.y - e.clientY / camera.zoom;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      persistCamera();
      schedule();
    }

    const onEnter = (e: PointerEvent) => {
      pointer.inside = true;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      schedule();
    };
    const onLeave = () => {
      if (!pan.active && !drag.active) pointer.inside = false;
      schedule();
    };
    const blockAux = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const hit = tokenAt(e.clientX, e.clientY);
      if (!hit) {
        const w = toWorld(e.clientX, e.clientY);
        setContextMenu(null);
        setCellMenu({
          cellX: Math.floor(w.x / mapCellPx()),
          cellY: Math.floor(w.y / mapCellPx()),
          x: Math.max(8, Math.min(window.innerWidth - 220, e.clientX)),
          y: Math.max(8, Math.min(window.innerHeight - 120, e.clientY)),
        });
        return;
      }
      if (!selectedEntityIdsRef.current.has(hit.id)) {
        updateMapSelection([hit.id]);
        syncTokenSelectionFlags();
        schedule();
      }
      setEffectId(STATUS_EFFECT_PRESETS[0].id);
      setAmount(1);
      setRollFor(DEFAULT_CHECK_ID);
      setContextMenu({
        id: hit.id,
        isPC: hit.isPC,
        x: Math.max(8, Math.min(window.innerWidth - 276, e.clientX)),
        y: Math.max(8, Math.min(window.innerHeight - 520, e.clientY)),
      });
    };
    const closeContextMenu = () => {
      setContextMenu(null);
      setCellMenu(null);
      setIntentMenu(null);
    };
    const onMapKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      const selectedIds = selectedEntityIdsRef.current;
      if (!selectedIds.size) return;
      const state = useRAM.getState();
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (state.uiSettings.confirmDeletes) {
          setConfirmGroupDelete(true);
          return;
        }
        for (const id of selectedIds) {
          if (state.pcs.some((entry) => entry.id === id)) state.deletePC(id);
          else if (state.tokens.some((entry) => entry.id === id)) state.deleteToken(id);
        }
        updateMapSelection([]);
        tokenCache = null;
        schedule();
        return;
      }
      const delta =
        event.key === "ArrowLeft"
          ? { x: -1, y: 0 }
          : event.key === "ArrowRight"
            ? { x: 1, y: 0 }
            : event.key === "ArrowUp"
              ? { x: 0, y: -1 }
              : event.key === "ArrowDown"
                ? { x: 0, y: 1 }
                : null;
      if (delta) {
        event.preventDefault();
        state.moveCreatures(
          buildTokens()
            .filter((entry) => selectedIds.has(entry.id))
            .map((entry) => ({
              id: entry.id,
              isPC: entry.isPC,
              x: entry.x + delta.x,
              y: entry.y + delta.y,
            }))
        );
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        const selected = buildTokens().filter((entry) => selectedIds.has(entry.id));
        if (!selected.length) return;
        const centerX =
          selected.reduce((sum, entry) => sum + entry.x + entry.width / 2, 0) /
          selected.length;
        const centerY =
          selected.reduce((sum, entry) => sum + entry.y + entry.height / 2, 0) /
          selected.length;
        camera.x = centerX * mapCellPx() - cssW / camera.zoom / 2;
        camera.y = centerY * mapCellPx() - cssH / camera.zoom / 2;
        persistCamera();
        schedule();
      }
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", endInteraction);
    canvas.addEventListener("pointercancel", endInteraction);
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("mousedown", blockAux);
    canvas.addEventListener("auxclick", blockAux);
    document.addEventListener("pointerdown", closeContextMenu);
    window.addEventListener("keydown", onMapKeyDown);

    function applySavedCamera() {
      const saved = useRAM.getState().mapCamera;
      if (saved) {
        camera.x = saved.x;
        camera.y = saved.y;
        camera.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, saved.zoom || 1));
        return true;
      }
      return false;
    }

    function initCamera() {
      if (disposed || cameraInitialized) return;
      cameraInitialized = true;
      if (!applySavedCamera()) {
        camera.x = (-cssW / camera.zoom + mapCellPx()) * 0.5;
        camera.y = (-cssH / camera.zoom + mapCellPx()) * 0.5;
        cameraReady = true;
        persistCamera();
      } else {
        cameraReady = true;
      }
      schedule();
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();
    void document.fonts?.ready.then(() => schedule());

    const unsubHydrate = useRAM.persist.onFinishHydration(() => {
      initCamera();
      useRAM.getState().flushSceneTriggers();
    });
    if (useRAM.persist.hasHydrated()) initCamera();

    const unsub = useRAM.subscribe((s, prev) => {
      if (s.uiSettings !== prev.uiSettings) {
        colorsReady = false;
      }
      let patchedPositions = false;
      if (
        s.settings !== prev.settings ||
        s.customLibraryItems !== prev.customLibraryItems ||
        s.ruleDefinitions !== prev.ruleDefinitions
      ) {
        tokenCache = null;
      } else if (s.pcs !== prev.pcs || s.tokens !== prev.tokens) {
        if (
          tokenCache &&
          onlyPositionChanged(prev.pcs, s.pcs) &&
          onlyPositionChanged(prev.tokens, s.tokens)
        ) {
          const positions = new Map<string, { x: number; y: number }>();
          for (const entry of s.pcs) positions.set(entry.id, entry);
          for (const entry of s.tokens) positions.set(entry.id, entry);
          for (const entry of tokenCache) {
            const live = positions.get(entry.id);
            if (!live) {
              tokenCache = null;
              break;
            }
            entry.x = live.x;
            entry.y = live.y;
          }
          patchedPositions = Boolean(tokenCache);
        } else {
          tokenCache = null;
        }
      } else if (s.selectedPcId !== prev.selectedPcId) {
        syncTokenSelectionFlags();
      }
      if (s.mapCamera && s.mapCamera !== prev.mapCamera && cameraReady) {
        const saved = s.mapCamera;
        if (
          Math.abs(saved.x - camera.x) > 0.01 ||
          Math.abs(saved.y - camera.y) > 0.01 ||
          Math.abs(saved.zoom - camera.zoom) > 0.001
        ) {
          camera.x = saved.x;
          camera.y = saved.y;
          camera.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, saved.zoom || 1));
          schedule();
        }
      }
      if (
        s.background !== prev.background ||
        s.lighting !== prev.lighting ||
        s.weather !== prev.weather ||
        s.sceneTransition !== prev.sceneTransition ||
        s.lightingTransition !== prev.lightingTransition ||
        s.weatherTransition !== prev.weatherTransition ||
        s.saveAreas !== prev.saveAreas ||
        s.selectedSaveAreaId !== prev.selectedSaveAreaId ||
        s.tokenFloaters !== prev.tokenFloaters ||
        s.tokenIntents !== prev.tokenIntents ||
        s.settings !== prev.settings ||
        s.uiSettings !== prev.uiSettings ||
        s.gameplaySettings !== prev.gameplaySettings ||
        s.combat !== prev.combat ||
        s.selectedPcId !== prev.selectedPcId
      ) {
        schedule();
      } else if ((s.pcs !== prev.pcs || s.tokens !== prev.tokens) && !patchedPositions) {
        schedule();
      }
    });

    /** Turn changes ask the map to bring the new combatant into view. */
    const onFocusCreature = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (!id || !cameraReady) return;
      const entry = buildTokens().find((token) => token.id === id);
      if (!entry) return;
      camera.x = (entry.x + entry.width / 2) * mapCellPx() - cssW / camera.zoom / 2;
      camera.y = (entry.y + entry.height / 2) * mapCellPx() - cssH / camera.zoom / 2;
      persistCamera();
      schedule();
    };
    window.addEventListener(FOCUS_CREATURE_EVENT, onFocusCreature);

    const onMotionChange = () => schedule(true);
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      disposed = true;
      pendingAfterRender = null;
      window.clearTimeout(persistCameraTimer);
      window.clearTimeout(frameTimer);
      window.clearTimeout(starTimer);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener(FOCUS_CREATURE_EVENT, onFocusCreature);
      writeCamera();
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      unsubHydrate();
      unsub();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", endInteraction);
      canvas.removeEventListener("pointercancel", endInteraction);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("mousedown", blockAux);
      canvas.removeEventListener("auxclick", blockAux);
      document.removeEventListener("pointerdown", closeContextMenu);
      window.removeEventListener("keydown", onMapKeyDown);
    };
  }, []);

  const target = contextMenu
    ? contextMenu.isPC
      ? pcs.find((pc) => pc.id === contextMenu.id)
      : mapTokens.find((token) => token.id === contextMenu.id)
    : undefined;
  const currentIntent = intentMenu
    ? tokenIntents.find(
        (intent) =>
          intent.id === intentMenu.intentId && intent.status === "pending"
      )
    : undefined;
  const intentPC = currentIntent
    ? pcs.find((pc) => pc.id === currentIntent.creatureId)
    : undefined;

  function acceptIntent(intent: TokenIntent) {
    const state = useRAM.getState();
    const pc = state.pcs.find((entry) => entry.id === intent.creatureId);
    if (!pc) {
      state.clearPCIntent(intent.creatureId);
      setIntentMenu(null);
      return;
    }
    if (intent.kind === "move" && intent.targetCell) {
      const destination = { ...pc, x: intent.targetCell.x, y: intent.targetCell.y };
      const distance =
        Math.max(Math.abs(pc.x - destination.x), Math.abs(pc.y - destination.y)) * 5;
      const speed = calculateCreatureStats(
        pc,
        state.ruleDefinitions,
        state.customLibraryItems
      ).speed;
      const occupied = new Set(
        [...state.pcs, ...state.tokens]
          .filter((entry) => entry.id !== pc.id)
          .flatMap(occupiedWorldCells)
          .map((cell) => `${cell.x}:${cell.y}`)
      );
      const blocked = occupiedWorldCells(destination).some((cell) =>
        occupied.has(`${cell.x}:${cell.y}`)
      );
      if (distance > speed || blocked) {
        state.addTokenFloater({
          creatureId: pc.id,
          title: "MOVE BLOCKED",
          detail: blocked ? "Destination occupied" : `${distance}ft exceeds ${speed}ft`,
          outcome: "fail",
          color: pc.color,
        });
        setIntentMenu(null);
        return;
      }
      state.addLog({
        role: "pc",
        author: pc.name,
        authorId: pc.id,
        color: pc.color,
        text: `*${intent.title}: ${intent.detail}*`,
      });
      state.moveCreature(pc.id, true, intent.targetCell.x, intent.targetCell.y);
    } else if (intent.kind === "roll" && intent.checkId) {
      const option = findCheckOption(
        checkOptionsFor(pc, state.ruleDefinitions, state.customLibraryItems),
        intent.checkId
      );
      if (option) {
        requestD20Roll((result) => {
          const d20 = d20FromResult(result);
          const total = d20 + option.modifier;
          const live = useRAM.getState();
          live.addLog({
            role: "system",
            author: "Check",
            authorId: pc.id,
            color: pc.color,
            text: `${pc.name} — ${option.shortLabel} ${d20} ${formatMod(option.modifier)} = ${total}.`,
          });
          live.addTokenFloater({
            creatureId: pc.id,
            title: option.shortLabel.toUpperCase(),
            detail: String(total),
            outcome: d20 === 20 ? "success" : d20 === 1 ? "fail" : "info",
            color: pc.color,
          });
        });
      }
    } else if (intent.payload) {
      const operation = String(intent.payload.operation ?? "");
      const value = String(intent.payload.value ?? "");
      const itemId = String(intent.payload.itemId ?? "");
      if (operation === "say") {
        state.addLog({
          role: "pc",
          author: pc.name,
          authorId: pc.id,
          color: pc.color,
          text: value,
        });
      } else if (operation === "emote") {
        state.addLog({
          role: "pc",
          author: pc.name,
          authorId: pc.id,
          color: pc.color,
          text: `*${value}*`,
        });
      } else if (operation === "equip" || operation === "unequip") {
        const inventory = pc.inventory.map((item) =>
          item.id === itemId
            ? {
                ...item,
                equipped: operation === "equip",
                ...(operation === "unequip" ? { equippedSlot: undefined } : {}),
              }
            : item
        );
        state.updatePC(pc.id, {
          inventory:
            operation === "equip"
              ? assignEquipmentSlots(inventory, state.customLibraryItems)
              : inventory,
        });
      } else if (operation === "remember" && value) {
        state.updatePC(pc.id, {
          knowledge: [pc.knowledge.trim(), value].filter(Boolean).join("\n"),
        });
      } else if (operation === "set_goal") {
        state.updatePC(pc.id, { goal: value });
      }
    } else if (
      intent.kind === "move" ||
      intent.kind === "action" ||
      intent.kind === "ask"
    ) {
      state.addLog({
        role: "pc",
        author: pc.name,
        authorId: pc.id,
        color: pc.color,
        text: `*${intent.title}: ${intent.detail}*`,
      });
    }
    state.clearPCIntent(intent.creatureId, intent.id);
    setIntentMenu(null);
  }

  const multiContext =
    Boolean(contextMenu) &&
    selectedEntityIds.length > 1 &&
    selectedEntityIds.includes(contextMenu!.id);

  type MenuTokenType = "pc" | TokenKind;

  function menuTokenType(isPC: boolean, creature: PC | MapToken): MenuTokenType {
    return isPC ? "pc" : (creature as MapToken).kind;
  }

  const MENU_TYPE_LABEL: Record<MenuTokenType, { one: string; many: string }> = {
    pc: { one: "Player Character", many: "player characters" },
    enemy: { one: "Enemy", many: "enemies" },
    npc: { one: "NPC", many: "NPCs" },
    object: { one: "Object", many: "objects" },
  };

  type CreaturePatch = Partial<
    Pick<PC, "hp" | "statuses" | "inventory" | "hidden" | "stealthTotal" | "deathSaves">
  >;

  function menuTargets(): Array<{ creature: PC | MapToken; isPC: boolean }> {
    if (!contextMenu) return [];
    const state = useRAM.getState();
    const ids = multiContext ? selectedEntityIds : [contextMenu.id];
    const targets: Array<{ creature: PC | MapToken; isPC: boolean }> = [];
    for (const id of ids) {
      const pc = state.pcs.find((entry) => entry.id === id);
      if (pc) {
        targets.push({ creature: pc, isPC: true });
        continue;
      }
      const token = state.tokens.find((entry) => entry.id === id);
      if (token) targets.push({ creature: token, isPC: false });
    }
    return targets;
  }

  const contextTargets = menuTargets();
  const contextTypes = new Set(
    contextTargets.map(({ creature, isPC }) => menuTokenType(isPC, creature))
  );
  const mixedTypes = multiContext && contextTypes.size > 1;
  const sharedType = contextTypes.size === 1 ? [...contextTypes][0] : null;
  const actionsLocked = mixedTypes;
  const lockTitle = mixedTypes ? "Select tokens of one type" : undefined;

  function patchCreature(isPC: boolean, id: string, patch: CreaturePatch) {
    const state = useRAM.getState();
    if (isPC) state.updatePC(id, patch);
    else state.updateToken(id, patch);
  }

  const checkOptions = useMemo(
    () => (target ? checkOptionsFor(target, rules, libraryItems) : []),
    [target, rules, libraryItems]
  );
  const fightable = contextTargets.filter(({ creature }) => canJoinCombat(creature));
  const contextCanFight = fightable.length > 0;
  const contextInCombat = fightable.filter(({ creature }) =>
    isInCombat(combat, creature.id)
  ).length;
  const contextOutsideCombat = fightable.length - contextInCombat;
  const canRoll = Boolean(target && creatureCanRollChecks(target));
  const usesDeathSaves = Boolean(target && creatureUsesDeathSaves(target));
  const deathLabel = target ? deathConditionLabel(target) : null;
  const dyingSaves = target ? deathSaveState(target) : null;

  function publishOutcome(
    creature: PC | MapToken,
    isPC: boolean,
    text: string,
    floater: { title: string; detail: string; outcome: "success" | "fail" | "info" }
  ) {
    const state = useRAM.getState();
    state.addLog({
      role: "system",
      author: floater.title === "DEATH SAVE" ? "Save" : "Check",
      color: creature.color,
      authorId: isPC ? creature.id : undefined,
      text,
    });
    state.addTokenFloater({
      creatureId: creature.id,
      ...floater,
    });
  }

  function adjustHp(delta: number) {
    if (actionsLocked) return;
    for (const { creature, isPC } of menuTargets()) {
      const result = applyHpChange(creature, delta, {
        usesDeathSaves: creatureUsesDeathSaves(creature),
      });
      patchCreature(isPC, creature.id, {
        hp: result.creature.hp,
        statuses: result.creature.statuses,
        deathSaves: result.creature.deathSaves,
      });
      const name = isPC ? creature.name : tokenDisplayName(creature as MapToken);
      if (result.log) {
        publishOutcome(creature, isPC, `${name} — ${result.log}.`, result.floater ?? {
          title: "HP",
          detail: `${result.creature.hp} HP`,
          outcome: "info",
        });
      } else if (result.floater) {
        publishOutcome(creature, isPC, `${name} — ${result.floater.detail}.`, result.floater);
      }
    }
  }

  function killToDeathSaves() {
    if (actionsLocked) return;
    for (const { creature, isPC } of menuTargets()) {
      const result = dropToDeathSaves(creature, creatureUsesDeathSaves(creature));
      patchCreature(isPC, creature.id, {
        hp: result.creature.hp,
        statuses: result.creature.statuses,
        deathSaves: result.creature.deathSaves,
      });
      const name = isPC ? creature.name : tokenDisplayName(creature as MapToken);
      if (result.log) {
        publishOutcome(creature, isPC, `${name} — ${result.log}.`, result.floater ?? {
          title: "HP",
          detail: `${result.creature.hp} HP`,
          outcome: "info",
        });
      } else if (result.floater) {
        publishOutcome(creature, isPC, `${name} — ${result.floater.detail}.`, result.floater);
      }
    }
  }

  function healToFull() {
    if (actionsLocked) return;
    for (const { creature, isPC } of menuTargets()) {
      const result = healFully(creature);
      patchCreature(isPC, creature.id, {
        hp: result.creature.hp,
        statuses: result.creature.statuses,
        deathSaves: result.creature.deathSaves,
      });
      const name = isPC ? creature.name : tokenDisplayName(creature as MapToken);
      if (result.log) {
        publishOutcome(creature, isPC, `${name} — ${result.log}.`, result.floater ?? {
          title: "HP",
          detail: `${result.creature.hp} HP`,
          outcome: "info",
        });
      } else if (result.floater) {
        publishOutcome(creature, isPC, `${name} — ${result.floater.detail}.`, result.floater);
      }
    }
  }

  function applyCheckRoll(
    creature: PC | MapToken,
    isPC: boolean,
    result: RollResult
  ) {
    const option = findCheckOption(
      checkOptionsFor(creature, rules, libraryItems),
      rollFor
    );
    if (!option || !creatureCanRollChecks(creature)) return;
    const d20 = d20FromResult(result);
    const total = d20 + option.modifier;
    const natural = d20 === 20 ? " (natural 20)" : d20 === 1 ? " (natural 1)" : "";
    const bonus = formatMod(option.modifier);
    const name = isPC ? creature.name : tokenDisplayName(creature as MapToken);
    const state = useRAM.getState();
    state.addLog({
      role: "system",
      author: "Check",
      color: creature.color,
      authorId: isPC ? creature.id : undefined,
      text: `${name} — ${option.shortLabel} ${d20} ${bonus} = ${total}${natural}.`,
    });
    state.addTokenFloater({
      creatureId: creature.id,
      title: option.shortLabel.toUpperCase(),
      detail: String(total),
      outcome: d20 === 20 ? "success" : d20 === 1 ? "fail" : "info",
    });
  }

  function rollCheck() {
    if (actionsLocked) return;
    const rollers = menuTargets().filter(({ creature }) =>
      creatureCanRollChecks(creature)
    );
    if (!rollers.length) return;
    setContextMenu(null);
    requestD20Rolls(
      rollers.map((entry) => (result) => applyCheckRoll(entry.creature, entry.isPC, result))
    );
  }

  function applyDeathSave(
    isPC: boolean,
    id: string,
    result: RollResult
  ) {
    const state = useRAM.getState();
    const live = isPC
      ? state.pcs.find((pc) => pc.id === id)
      : state.tokens.find((token) => token.id === id);
    if (!live || !creatureUsesDeathSaves(live) || live.hp > 0) return;
    const applied = applyDeathSaveRoll(live, d20FromResult(result));
    patchCreature(isPC, id, {
      hp: applied.creature.hp,
      statuses: applied.creature.statuses,
      deathSaves: applied.creature.deathSaves,
    });
    const name = isPC ? live.name : tokenDisplayName(live as MapToken);
    state.addLog({
      role: "system",
      author: "Save",
      color: live.color,
      authorId: isPC ? id : undefined,
      text: `${name} — ${applied.log}.`,
    });
    state.addTokenFloater({
      creatureId: id,
      title: applied.title,
      detail: applied.detail,
      outcome: applied.outcome,
    });
  }

  function rollDeathSave() {
    if (actionsLocked) return;
    const dying = menuTargets().filter(({ creature }) => {
      const saves = deathSaveState(creature);
      return (
        creatureUsesDeathSaves(creature) &&
        creature.hp <= 0 &&
        !saves?.dead &&
        !saves?.stable
      );
    });
    if (!dying.length) return;
    setContextMenu(null);
    requestD20Rolls(
      dying.map((entry) => (result) => applyDeathSave(entry.isPC, entry.creature.id, result))
    );
  }

  /**
   * Rolls a d20 per selected creature and only commits once every die has
   * landed, so the order is built from the full set rather than growing as
   * each animation finishes.
   */
  function rollInitiativeFor(mode: "start" | "join") {
    const joiners = menuTargets().filter(({ creature }) => canJoinCombat(creature));
    if (!joiners.length) return;
    setContextMenu(null);
    const rolled: Array<{ id: string; isPC: boolean; d20: number; dexMod: number }> = [];
    requestD20Rolls(
      joiners.map((entry) => (result) => {
        rolled.push({
          id: entry.creature.id,
          isPC: entry.isPC,
          d20: d20FromResult(result),
          dexMod: initiativeModifier(entry.creature, rules, libraryItems),
        });
        if (rolled.length < joiners.length) return;
        const state = useRAM.getState();
        if (mode === "start" || !state.combat) {
          state.startCombat(rolled);
          return;
        }
        for (const entry of rolled) {
          state.addCombatant(entry.id, entry.isPC, entry.d20, entry.dexMod);
        }
      })
    );
  }

  function removeFromCombat() {
    const state = useRAM.getState();
    setContextMenu(null);
    for (const { creature } of menuTargets()) state.removeCombatant(creature.id);
  }

  function addEffect() {
    if (actionsLocked) return;
    const preset =
      STATUS_EFFECT_PRESETS.find((entry) => entry.id === effectId) ??
      STATUS_EFFECT_PRESETS[0];
    const state = useRAM.getState();
    for (const { creature, isPC } of menuTargets()) {
      if (preset.id === "hidden" || preset.id === "invisible") {
        patchCreature(
          isPC,
          creature.id,
          concealCreature(
            creature,
            state.ruleDefinitions,
            state.customLibraryItems,
            preset.id
          )
        );
        continue;
      }
      patchCreature(isPC, creature.id, {
        statuses: [
          ...(creature.statuses ?? []),
          {
            id: crypto.randomUUID(),
            effectId: preset.id,
            name: preset.name,
            kind: preset.kind,
            color: preset.color,
            note: "",
          },
        ],
      });
    }
  }

  function toggleConcealment() {
    if (!target || actionsLocked) return;
    const hide = !isConcealed(target);
    const state = useRAM.getState();
    for (const { creature, isPC } of menuTargets()) {
      patchCreature(
        isPC,
        creature.id,
        hide
          ? concealCreature(
              creature,
              state.ruleDefinitions,
              state.customLibraryItems,
              "hidden"
            )
          : revealCreature(creature)
      );
    }
  }

  function giveItem() {
    if (actionsLocked) return;
    const item = libraryItems.find(
      (entry) => entry.id === (libraryItemId || sortedLibraryItems[0]?.id)
    );
    if (!item) return;
    for (const { creature, isPC } of menuTargets()) {
      patchCreature(isPC, creature.id, {
        inventory: [
          ...creature.inventory,
          {
            id: crypto.randomUUID(),
            libraryItemId: item.id,
            name: item.name,
            qty: Math.max(1, amount),
            notes: "",
            equipped: false,
          },
        ],
      });
    }
  }

  function deleteSelection() {
    const state = useRAM.getState();
    for (const id of selectedEntityIdsRef.current) {
      if (state.pcs.some((entry) => entry.id === id)) state.deletePC(id);
      else if (state.tokens.some((entry) => entry.id === id)) state.deleteToken(id);
    }
    updateMapSelection([]);
  }

  return (
    <div className="map-layer">
      <canvas
        ref={canvasRef}
        className={selectedSaveAreaId ? "area-paint" : undefined}
      />
      {selectedSaveArea && (
        <div className="map-area-hint">
          Click empty cells to shape <strong>{selectedSaveArea.name}</strong>. Drag
          tokens as usual.
        </div>
      )}
      {intentMenu && currentIntent && intentPC && createPortal(
        <div
          className="token-context-menu token-intent-menu"
          style={{ left: intentMenu.x, top: intentMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
          aria-label={`${intentPC.name} intent`}
        >
          <header>
            <strong>{currentIntent.title}</strong>
            <small>{intentPC.name} is attempting</small>
          </header>
          <section>
            <p>{currentIntent.detail}</p>
            <div className="token-context-menu__buttons">
              {currentIntent.autonomy === "propose" && (
                <RamButton size="sm" onClick={() => acceptIntent(currentIntent)}>
                  Accept
                </RamButton>
              )}
              <RamButton
                size="sm"
                variant="danger"
                onClick={() => {
                  useRAM
                    .getState()
                    .clearPCIntent(currentIntent.creatureId, currentIntent.id);
                  setIntentMenu(null);
                }}
              >
                Dismiss
              </RamButton>
            </div>
          </section>
        </div>,
        document.body
      )}
      {cellMenu && createPortal(
        <div
          className="token-context-menu"
          style={{ left: cellMenu.x, top: cellMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
          aria-label="Map cell actions"
        >
          <header>
            <strong>
              Cell {cellMenu.cellX}, {cellMenu.cellY}
            </strong>
            <small>Save area</small>
          </header>
          <section>
            <div className="token-context-menu__buttons">
              <RamButton
                size="sm"
                icon={Hexagon}
                onClick={() => {
                  useRAM.getState().addSaveArea([{ x: cellMenu.cellX, y: cellMenu.cellY }]);
                  setCellMenu(null);
                }}
              >
                Add save area
              </RamButton>
            </div>
          </section>
        </div>,
        document.body
      )}
      {contextMenu && target && createPortal(
        <div
          className="token-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
          aria-label={
            multiContext
              ? `${selectedEntityIds.length} selected token actions`
              : `${target.name} actions`
          }
        >
          <header>
            <strong>
              {multiContext
                ? `${selectedEntityIds.length} ${
                    sharedType ? MENU_TYPE_LABEL[sharedType].many : "tokens"
                  } selected`
                : target.name}
            </strong>
            <small>
              {multiContext
                ? mixedTypes
                  ? "Mixed types"
                  : sharedType
                    ? MENU_TYPE_LABEL[sharedType].one
                    : "Selected"
                : contextMenu.isPC
                  ? "Player Character"
                  : "Map Token"}
              {!multiContext && deathLabel ? ` · ${deathLabel}` : ""}
            </small>
            {multiContext && (
              <p className="token-context-menu__hint">
                {mixedTypes
                  ? "Select one token type to use these actions."
                  : "Whatever you choose applies to all selected."}
              </p>
            )}
          </header>

          {contextCanFight && (
            <section>
              <span>Combat</span>
              {!combat ? (
                <RamButton
                  size="sm"
                  icon={Swords}
                  onClick={() => rollInitiativeFor("start")}
                >
                  Roll initiative
                </RamButton>
              ) : (
                <>
                  {contextOutsideCombat > 0 && (
                    <RamButton
                      size="sm"
                      icon={Swords}
                      onClick={() => rollInitiativeFor("join")}
                    >
                      {contextOutsideCombat > 1
                        ? `Join combat (${contextOutsideCombat})`
                        : "Join combat"}
                    </RamButton>
                  )}
                  {contextInCombat > 0 && (
                    <RamButton
                      size="sm"
                      variant="danger"
                      icon={UserMinus}
                      onClick={removeFromCombat}
                    >
                      {contextInCombat > 1
                        ? `Leave combat (${contextInCombat})`
                        : "Leave combat"}
                    </RamButton>
                  )}
                </>
              )}
            </section>
          )}

          {canRoll && (
            <section>
              <span>Roll for</span>
              <RamSelect
                value={rollFor}
                aria-label="Check to roll"
                disabled={actionsLocked}
                onChange={(event) => setRollFor(event.target.value as CheckId)}
              >
                {(["Skills", "Ability checks", "Saving throws"] as const).map((group) => (
                  <optgroup label={group} key={group}>
                    {checkOptions
                      .filter((option) => option.group === group)
                      .map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </RamSelect>
              <RamButton
                size="sm"
                icon={Dices}
                disabled={actionsLocked}
                title={lockTitle}
                onClick={rollCheck}
              >
                Roll
              </RamButton>
            </section>
          )}

          {usesDeathSaves && (target.hp <= 0 || dyingSaves?.dead) && (
            <section>
              <span>Death saves</span>
              <div className="death-save-pips" aria-label={deathLabel ?? "Death saves"}>
                <span>
                  Successes
                  {[0, 1, 2].map((index) => (
                    <i
                      key={`ok-${index}`}
                      className={
                        index < (dyingSaves?.successes ?? 0) ? "is-on is-success" : undefined
                      }
                    />
                  ))}
                </span>
                <span>
                  Failures
                  {[0, 1, 2].map((index) => (
                    <i
                      key={`fail-${index}`}
                      className={
                        index < (dyingSaves?.failures ?? 0) || dyingSaves?.dead
                          ? "is-on is-fail"
                          : undefined
                      }
                    />
                  ))}
                </span>
              </div>
              {dyingSaves?.dead ? (
                <small>Dead. Healing revives this creature.</small>
              ) : dyingSaves?.stable ? (
                <small>Stable at 0 HP. Damage starts death saves again.</small>
              ) : (
                <RamButton
                  size="sm"
                  icon={Skull}
                  variant="danger"
                  disabled={actionsLocked}
                  title={lockTitle}
                  onClick={rollDeathSave}
                >
                  Roll death save
                </RamButton>
              )}
            </section>
          )}

          <section>
            <span>Manage</span>
            <div className="token-context-menu__buttons">
              <RamButton
                size="sm"
                icon={Pencil}
                disabled={multiContext || actionsLocked}
                title={
                  multiContext || actionsLocked
                    ? lockTitle ?? "Edit one token at a time"
                    : undefined
                }
                onClick={() => {
                  const state = useRAM.getState();
                  if (contextMenu.isPC) state.selectPC(contextMenu.id);
                  else {
                    const token = state.tokens.find((entry) => entry.id === contextMenu.id);
                    if (token) {
                      state.setTokenManagerOpen(true, token.kind, "map", token.id);
                    }
                  }
                  setContextMenu(null);
                }}
              >
                Edit
              </RamButton>
              <RamButton
                size="sm"
                icon={Copy}
                disabled={actionsLocked}
                title={lockTitle}
                onClick={() => {
                  if (actionsLocked) return;
                  const state = useRAM.getState();
                  for (const { creature, isPC } of menuTargets()) {
                    if (isPC) state.duplicatePC(creature.id);
                    else state.duplicateToken(creature.id);
                  }
                  setContextMenu(null);
                }}
              >
                Duplicate
              </RamButton>
              <RamButton
                size="sm"
                icon={Trash2}
                variant="danger"
                disabled={actionsLocked}
                title={lockTitle}
                onClick={() => {
                  if (actionsLocked) return;
                  if (multiContext) {
                    if (confirmDeletes) setConfirmGroupDelete(true);
                    else deleteSelection();
                  } else if (confirmDeletes) {
                    setDeleteTarget({
                      id: contextMenu.id,
                      isPC: contextMenu.isPC,
                      name: target.name,
                    });
                  } else {
                    const ram = useRAM.getState();
                    if (contextMenu.isPC) ram.deletePC(contextMenu.id);
                    else ram.deleteToken(contextMenu.id);
                  }
                  setContextMenu(null);
                }}
              >
                Delete
              </RamButton>
            </div>
          </section>

          <section>
            <span>Sight</span>
            <div className="token-context-menu__buttons">
              <RamButton
                size="sm"
                icon={isConcealed(target) ? Eye : EyeOff}
                disabled={actionsLocked}
                title={lockTitle}
                onClick={() => {
                  toggleConcealment();
                  setContextMenu(null);
                }}
              >
                {isConcealed(target) ? "Reveal" : "Hide"}
              </RamButton>
            </div>
            {"stealthTotal" in target && target.stealthTotal != null && (
              <small>Stealth {target.stealthTotal}</small>
            )}
          </section>

          <section>
            <span>Health</span>
            <div className="token-context-menu__inline">
              <RamInput
                type="number"
                min={1}
                value={amount}
                aria-label="Health amount"
                disabled={actionsLocked}
                onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))}
              />
              <RamButton
                size="sm"
                icon={Skull}
                variant="danger"
                disabled={actionsLocked}
                title={lockTitle}
                onClick={() => adjustHp(-amount)}
              >
                Damage
              </RamButton>
              <RamButton
                size="sm"
                icon={HeartPulse}
                disabled={actionsLocked}
                title={lockTitle}
                onClick={() => adjustHp(amount)}
              >
                Heal
              </RamButton>
            </div>
            <div className="token-context-menu__buttons">
              <RamButton
                size="sm"
                icon={HeartOff}
                variant="danger"
                disabled={actionsLocked}
                title={lockTitle}
                onClick={() => killToDeathSaves()}
              >
                Kill
              </RamButton>
              <RamButton
                size="sm"
                icon={Heart}
                disabled={actionsLocked}
                title={lockTitle}
                onClick={() => healToFull()}
              >
                Heal fully
              </RamButton>
            </div>
          </section>

          <section>
            <span>Effects</span>
            <RamSelect
              value={effectId}
              aria-label="Effect to add"
              disabled={actionsLocked}
              onChange={(event) =>
                setEffectId(event.target.value as (typeof STATUS_EFFECT_PRESETS)[number]["id"])
              }
            >
              {STATUS_EFFECT_PRESETS.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.kind === "buff" ? "Buff" : "Debuff"} — {preset.name}
                </option>
              ))}
            </RamSelect>
            <RamButton
              size="sm"
              icon={ShieldPlus}
              disabled={actionsLocked}
              title={lockTitle}
              onClick={addEffect}
            >
              Add Effect
            </RamButton>
          </section>

          <section>
            <span>Give Item</span>
            <RamSelect
              className={itemRarityClassName(
                sortedLibraryItems.find(
                  (item) => item.id === (libraryItemId || sortedLibraryItems[0]?.id)
                )?.rarity
              )}
              value={libraryItemId || sortedLibraryItems[0]?.id || ""}
              disabled={actionsLocked}
              onChange={(event) => setLibraryItemId(event.target.value)}
            >
              {sortedLibraryItems.map((item) => (
                <option
                  value={item.id}
                  key={item.id}
                  style={itemRarityStyle(item.rarity)}
                >
                  {item.name}
                </option>
              ))}
            </RamSelect>
            <RamButton
              size="sm"
              icon={PackagePlus}
              disabled={actionsLocked}
              title={lockTitle}
              onClick={giveItem}
            >
              Add to Inventory
            </RamButton>
          </section>
        </div>,
        document.body
      )}
      <RamConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "token"}?`}
        description={
          deleteTarget?.isPC
            ? "This character and its map token will be permanently removed."
            : "This token will be permanently removed from the map."
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          const ram = useRAM.getState();
          if (deleteTarget.isPC) ram.deletePC(deleteTarget.id);
          else ram.deleteToken(deleteTarget.id);
        }}
        onClose={() => setDeleteTarget(null)}
      />
      <RamConfirmDialog
        open={confirmGroupDelete}
        title={`Delete ${selectedEntityIds.length} selected tokens?`}
        description="The selected characters and map tokens will be permanently removed."
        confirmLabel="Delete all"
        onConfirm={deleteSelection}
        onClose={() => setConfirmGroupDelete(false)}
      />
    </div>
  );
}

export type { MapToken, PC };
