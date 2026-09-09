import { Copy, Dices, Eye, EyeOff, HeartPulse, Hexagon, PackagePlus, Pencil, ShieldPlus, Skull, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRAM } from "../store";
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_OPACITY,
  DEFAULT_VISUAL_SCALE,
  formatMod,
  STATUS_EFFECT_PRESETS,
  TOKEN_FLOATER_MS,
  normalizeGridOpacity,
  normalizeGridSize,
  normalizeVisualScale,
  rectangularTokenBounds,
  statusEffectColor,
  tokenDisplayName,
  type MapBackground,
  type MapToken,
  type PC,
  type SaveArea,
  type StatusEffect,
  type TokenCell,
  type TokenFloater,
} from "../types";
import {
  checkOptionsFor,
  creatureCanRollChecks,
  DEFAULT_CHECK_ID,
  findCheckOption,
  type CheckId,
} from "../checks";
import { d20FromResult, requestD20Roll } from "../diceRolls";
import {
  applyDeathSaveRoll,
  applyHpChange,
  creatureUsesDeathSaves,
  deathConditionLabel,
  deathSaveState,
} from "../deathSaves";
import { concealCreature, isConcealed, partyCanPerceive, revealCreature } from "../perception";
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
  return normalizeGridSize(useRAM.getState().uiSettings.gridSize ?? DEFAULT_GRID_SIZE);
}

function mapGridOpacity() {
  return normalizeGridOpacity(
    useRAM.getState().uiSettings.gridOpacity ?? DEFAULT_GRID_OPACITY
  ) / 100;
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
const STAR_FRAME_MS = 90;

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

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [contextMenu, setContextMenu] = useState<TokenContextMenu | null>(null);
  const [cellMenu, setCellMenu] = useState<MapCellMenu | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    isPC: boolean;
    name: string;
  } | null>(null);
  const [effectId, setEffectId] = useState<
    (typeof STATUS_EFFECT_PRESETS)[number]["id"]
  >(STATUS_EFFECT_PRESETS[0].id);
  const [amount, setAmount] = useState(1);
  const [libraryItemId, setLibraryItemId] = useState("");
  const [rollFor, setRollFor] = useState<CheckId>(DEFAULT_CHECK_ID);
  const libraryItems = useRAM((state) => state.customLibraryItems);
  const rules = useRAM((state) => state.ruleDefinitions);
  const pcs = useRAM((state) => state.pcs);
  const mapTokens = useRAM((state) => state.tokens);
  const selectedSaveAreaId = useRAM((state) => state.selectedSaveAreaId);
  const saveAreas = useRAM((state) => state.saveAreas);
  const selectedSaveArea = saveAreas.find((area) => area.id === selectedSaveAreaId);
  const sortedLibraryItems = useMemo(
    () => [...libraryItems].sort((a, b) => a.name.localeCompare(b.name)),
    [libraryItems]
  );

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
    const drag = {
      active: false,
      id: "",
      isPC: false,
      offX: 0,
      offY: 0,
      x: 0,
      y: 0,
    };
    let tokenCache: Draggable[] | null = null;
    const paint = {
      active: false,
      add: true,
      visited: new Set<string>(),
    };

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let raf = 0;
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
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const imageCache = new Map<string, HTMLImageElement>();
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
          hpFrac:
            t.maxHp && t.maxHp > 0 && t.hp !== undefined
              ? Math.max(0, Math.min(1, t.hp / t.maxHp))
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
          hpFrac: p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : undefined,
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
          selected: p.id === s.selectedPcId,
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
      return tokenCache.map((entry) =>
        entry.id === drag.id ? { ...entry, x: drag.x, y: drag.y } : entry
      );
    }

    function schedule(dirty = true) {
      if (dirty) {
        sceneDirty = true;
      }
      if (raf || disposed) return;
      raf = requestAnimationFrame(render);
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

      if (t.selected && !t.image) {
        ctx!.save();
        ctx!.strokeStyle = colors.accent;
        ctx!.lineWidth = Math.max(1.2, 1.5 * zoom);
        ctx!.beginPath();
        ctx!.roundRect(
          drawLeft - inset * 0.45,
          drawTop - inset * 0.45,
          drawSize + inset * 0.9,
          drawSize + inset * 0.9,
          radius
        );
        ctx!.stroke();
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
          ctx!.fillStyle =
            t.hpFrac > 0.5 ? "#637c79" : t.hpFrac > 0.25 ? "#747d9f" : "#765462";
          ctx!.fillRect(cx - bw / 2, by, bw * t.hpFrac, bh);
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

    function drawSnapGhost(t: Draggable, snapX: number, snapY: number, zoom: number) {
      if (Math.abs(t.x - snapX) < 0.02 && Math.abs(t.y - snapY) < 0.02) return;
      const cellSize = mapCellPx() * zoom;
      const inset = Math.max(2, cellSize * 0.08);
      ctx!.save();
      ctx!.setLineDash([4, 4]);
      ctx!.strokeStyle = colorWithAlpha(t.color, 0.7);
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

    function render() {
      raf = 0;
      if (disposed) return;
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

      function drawMap(background: MapBackground | null, alpha: number) {
        if (!background || alpha <= 0) return;
        const img = getImage(background.src);
        if (!img) return;
        const s = background.scale * zoom;
        const left = -camera.x * zoom;
        const top = -camera.y * zoom;
        const width = img.naturalWidth * s;
        const height = img.naturalHeight * s;
        ctx!.save();
        ctx!.globalAlpha = alpha;
        ctx!.imageSmoothingEnabled = true;
        ctx!.imageSmoothingQuality = pan.active ? "low" : "medium";
        ctx!.fillStyle = "#1c1e26";
        ctx!.fillRect(left, top, width, height);
        ctx!.drawImage(img, left, top, width, height);
        ctx!.restore();
      }

      const useCache = !sceneDirty && sceneCacheValid && sceneCache.width > 0;
      let starsBusy = !reducedMotion && lighting.stars > 0.02;
      if (useCache) {
        ctx!.setTransform(1, 0, 0, 1, 0, 0);
        ctx!.drawImage(sceneCache, 0, 0);
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else {
        ctx!.fillStyle = colors.background;
        ctx!.fillRect(0, 0, cssW, cssH);
        starsBusy = drawStarfield(ctx!, cssW, cssH, lighting, now, reducedMotion);

        if (fade < 1 && transition?.fromBackground) {
          drawMap(transition.fromBackground, 1 - fade);
        }
        drawMap(state.background, fade);

        const gridStep = stepForMin(cellPx, MIN_GRID_PX);
        const worldRight = camera.x + cssW / zoom;
        const worldBottom = camera.y + cssH / zoom;
        const colStart = Math.floor(camera.x / mapCellPx() / gridStep) * gridStep;
        const colEnd = Math.floor(worldRight / mapCellPx());
        const rowStart = Math.floor(camera.y / mapCellPx() / gridStep) * gridStep;
        const rowEnd = Math.floor(worldBottom / mapCellPx());

        const gridOpacity = mapGridOpacity();
        const visBoost = 1 + lighting.multiplyAlpha * 0.9;
        if (hasHover) {
          const hx = (hoverCellX * mapCellPx() - camera.x) * zoom;
          const hy = (hoverCellY * mapCellPx() - camera.y) * zoom;
          ctx!.fillStyle = colorWithAlpha(
            colors.hoverFill,
            Math.min(1, gridOpacity * visBoost * 0.5)
          );
          ctx!.fillRect(hx, hy, cellPx, cellPx);
          ctx!.strokeStyle = colorWithAlpha(
            colors.hoverStroke,
            Math.min(1, gridOpacity * visBoost * 2)
          );
          ctx!.lineWidth = 1;
          ctx!.strokeRect(hair(hx), hair(hy), cellPx, cellPx);
        }

        ctx!.strokeStyle = colorWithAlpha(colors.grid, Math.min(1, gridOpacity * visBoost));
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
        ctx!.strokeStyle = colorWithAlpha(
          colors.gridMajor,
          Math.min(1, gridOpacity * visBoost * 1.6)
        );
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
        ctx!.strokeStyle = colors.axis;
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

        drawSaveAreas(state.saveAreas ?? [], state.selectedSaveAreaId, zoom);

        drawLightingOverlay(ctx!, cssW, cssH, lighting);
        resetCompositing(ctx!);

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
        ctx!.save();
        if (fade < 1) ctx!.globalAlpha = fade;
        for (const t of sceneTokens) {
          if (!t.isPC) drawToken(t, zoom, lighting);
        }
        ctx!.restore();
        resetCompositing(ctx!);
        for (const t of sceneTokens) {
          if (t.isPC) drawToken(t, zoom, lighting);
        }
        if (drag.active) {
          const dragged = sceneTokens.find((entry) => entry.id === drag.id);
          if (dragged) {
            drawSnapGhost(dragged, Math.round(drag.x), Math.round(drag.y), zoom);
          }
        }
        if (sceneCacheCtx && (starsBusy || weatherTransition || state.weather !== "clear")) {
          sceneCacheCtx.setTransform(1, 0, 0, 1, 0, 0);
          sceneCacheCtx.drawImage(canvas!, 0, 0);
          sceneCacheValid = true;
        } else {
          sceneCacheValid = false;
        }
        sceneDirty = false;
      }

      const liveTokens = tokens();
      const weatherBusy = drawWeather(
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

      const labelStep = stepForMin(cellPx, MIN_LABEL_PX);
      const worldRight = camera.x + cssW / zoom;
      const worldBottom = camera.y + cssH / zoom;
      const colEnd = Math.floor(worldRight / mapCellPx());
      const rowEnd = Math.floor(worldBottom / mapCellPx());
      ctx!.fillStyle = colors.background;
      ctx!.fillRect(0, 0, cssW, RULER_TOP);
      ctx!.fillRect(0, 0, RULER_LEFT, cssH);
      ctx!.strokeStyle = colors.grid;
      ctx!.beginPath();
      ctx!.moveTo(hair(RULER_LEFT), RULER_TOP);
      ctx!.lineTo(hair(RULER_LEFT), cssH);
      ctx!.moveTo(RULER_LEFT, hair(RULER_TOP));
      ctx!.lineTo(cssW, hair(RULER_TOP));
      ctx!.stroke();

      ctx!.fillStyle = colors.rulerLabel;
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
      if (weatherBusy || floatersBusy) schedule(false);
      if (starsBusy && !starTimer) {
        starTimer = window.setTimeout(() => {
          starTimer = 0;
          if (!disposed) schedule(true);
        }, STAR_FRAME_MS);
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

      if (drag.active) {
        const w = toWorld(e.clientX, e.clientY);
        drag.x = w.x / mapCellPx() - drag.offX;
        drag.y = w.y / mapCellPx() - drag.offY;
        schedule();
        return;
      }

      canvas!.classList.toggle("token-hover", tokenAt(e.clientX, e.clientY) !== null);
      const world = toWorld(e.clientX, e.clientY);
      const nextHoverX = Math.floor(world.x / mapCellPx());
      const nextHoverY = Math.floor(world.y / mapCellPx());
      if (hasHover && nextHoverX === hoverCellX && nextHoverY === hoverCellY) return;
      schedule();
    }

    function onPointerDown(e: PointerEvent) {
      setContextMenu(null);
      setCellMenu(null);
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
        const hit = tokenAt(e.clientX, e.clientY);
        if (hit) {
          const w = toWorld(e.clientX, e.clientY);
          drag.active = true;
          drag.id = hit.id;
          drag.isPC = hit.isPC;
          drag.offX = w.x / mapCellPx() - hit.x;
          drag.offY = w.y / mapCellPx() - hit.y;
          drag.x = hit.x;
          drag.y = hit.y;
          canvas!.classList.add("token-dragging");
          try {
            canvas!.setPointerCapture(e.pointerId);
          } catch {
            /* best-effort */
          }
          if (hit.isPC) useRAM.getState().selectPC(hit.id);
        } else {
          const state = useRAM.getState();
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
        const nx = Math.round(drag.x);
        const ny = Math.round(drag.y);
        useRAM.getState().moveCreature(drag.id, drag.isPC, nx, ny);
        drag.active = false;
        canvas!.classList.remove("token-dragging");
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
      if (
        s.pcs !== prev.pcs ||
        s.tokens !== prev.tokens ||
        s.settings !== prev.settings ||
        s.selectedPcId !== prev.selectedPcId ||
        s.customLibraryItems !== prev.customLibraryItems ||
        s.ruleDefinitions !== prev.ruleDefinitions
      ) {
        tokenCache = null;
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
        s.pcs !== prev.pcs ||
        s.tokens !== prev.tokens ||
        s.background !== prev.background ||
        s.lighting !== prev.lighting ||
        s.weather !== prev.weather ||
        s.sceneTransition !== prev.sceneTransition ||
        s.lightingTransition !== prev.lightingTransition ||
        s.weatherTransition !== prev.weatherTransition ||
        s.saveAreas !== prev.saveAreas ||
        s.selectedSaveAreaId !== prev.selectedSaveAreaId ||
        s.tokenFloaters !== prev.tokenFloaters ||
        s.settings !== prev.settings ||
        s.uiSettings !== prev.uiSettings ||
        s.selectedPcId !== prev.selectedPcId
      ) {
        schedule();
      }
    });

    const onMotionChange = () => schedule(true);
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      disposed = true;
      window.clearTimeout(persistCameraTimer);
      window.clearTimeout(starTimer);
      motionQuery.removeEventListener("change", onMotionChange);
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
    };
  }, []);

  const target = contextMenu
    ? contextMenu.isPC
      ? pcs.find((pc) => pc.id === contextMenu.id)
      : mapTokens.find((token) => token.id === contextMenu.id)
    : undefined;

  function updateTarget(
    patch: Partial<
      Pick<PC, "hp" | "statuses" | "inventory" | "hidden" | "stealthTotal" | "deathSaves">
    >
  ) {
    if (!contextMenu) return;
    const state = useRAM.getState();
    if (contextMenu.isPC) state.updatePC(contextMenu.id, patch);
    else state.updateToken(contextMenu.id, patch);
  }

  const checkOptions = useMemo(
    () => (target ? checkOptionsFor(target, rules, libraryItems) : []),
    [target, rules, libraryItems]
  );
  const canRoll = Boolean(target && creatureCanRollChecks(target));
  const usesDeathSaves = Boolean(target && creatureUsesDeathSaves(target));
  const deathLabel = target ? deathConditionLabel(target) : null;
  const dyingSaves = target ? deathSaveState(target) : null;

  function publishOutcome(
    text: string,
    floater: { title: string; detail: string; outcome: "success" | "fail" | "info" }
  ) {
    if (!contextMenu || !target) return;
    const state = useRAM.getState();
    state.addLog({
      role: "system",
      author: floater.title === "DEATH SAVE" ? "Save" : "Check",
      color: target.color,
      authorId: contextMenu.isPC ? contextMenu.id : undefined,
      text,
    });
    state.addTokenFloater({
      creatureId: contextMenu.id,
      ...floater,
    });
  }

  function adjustHp(delta: number) {
    if (!target || !contextMenu) return;
    const result = applyHpChange(target, delta, {
      usesDeathSaves: creatureUsesDeathSaves(target),
    });
    updateTarget({
      hp: result.creature.hp,
      statuses: result.creature.statuses,
      deathSaves: result.creature.deathSaves,
    });
    const name = contextMenu.isPC ? target.name : tokenDisplayName(target as MapToken);
    if (result.log) {
      publishOutcome(`${name} — ${result.log}.`, result.floater ?? {
        title: "HP",
        detail: `${result.creature.hp} HP`,
        outcome: "info",
      });
    } else if (result.floater) {
      publishOutcome(`${name} — ${result.floater.detail}.`, result.floater);
    }
  }

  function rollCheck() {
    if (!target || !contextMenu) return;
    const option = findCheckOption(checkOptions, rollFor);
    if (!option) return;
    const creature = target;
    const menu = contextMenu;
    const name = menu.isPC ? creature.name : tokenDisplayName(creature as MapToken);
    setContextMenu(null);
    requestD20Roll((result) => {
      const d20 = d20FromResult(result);
      const total = d20 + option.modifier;
      const natural = d20 === 20 ? " (natural 20)" : d20 === 1 ? " (natural 1)" : "";
      const bonus = formatMod(option.modifier);
      const state = useRAM.getState();
      state.addLog({
        role: "system",
        author: "Check",
        color: creature.color,
        authorId: menu.isPC ? menu.id : undefined,
        text: `${name} — ${option.shortLabel} ${d20} ${bonus} = ${total}${natural}.`,
      });
      state.addTokenFloater({
        creatureId: menu.id,
        title: option.shortLabel.toUpperCase(),
        detail: String(total),
        outcome: d20 === 20 ? "success" : d20 === 1 ? "fail" : "info",
      });
    });
  }

  function rollDeathSave() {
    if (!target || !contextMenu) return;
    const menu = contextMenu;
    const name = menu.isPC ? target.name : tokenDisplayName(target as MapToken);
    setContextMenu(null);
    requestD20Roll((result) => {
      const state = useRAM.getState();
      const live = menu.isPC
        ? state.pcs.find((pc) => pc.id === menu.id)
        : state.tokens.find((token) => token.id === menu.id);
      if (!live) return;
      const applied = applyDeathSaveRoll(live, d20FromResult(result));
      if (menu.isPC) {
        state.updatePC(menu.id, {
          hp: applied.creature.hp,
          statuses: applied.creature.statuses,
          deathSaves: applied.creature.deathSaves,
        });
      } else {
        state.updateToken(menu.id, {
          hp: applied.creature.hp,
          statuses: applied.creature.statuses,
          deathSaves: applied.creature.deathSaves,
        });
      }
      state.addLog({
        role: "system",
        author: "Save",
        color: live.color,
        authorId: menu.isPC ? menu.id : undefined,
        text: `${name} — ${applied.log}.`,
      });
      state.addTokenFloater({
        creatureId: menu.id,
        title: applied.title,
        detail: applied.detail,
        outcome: applied.outcome,
      });
    });
  }

  function addEffect() {
    if (!target) return;
    const preset =
      STATUS_EFFECT_PRESETS.find((entry) => entry.id === effectId) ??
      STATUS_EFFECT_PRESETS[0];
    const state = useRAM.getState();
    if (preset.id === "hidden" || preset.id === "invisible") {
      updateTarget(
        concealCreature(target, state.ruleDefinitions, state.customLibraryItems, preset.id)
      );
      return;
    }
    updateTarget({
      statuses: [
        ...(target.statuses ?? []),
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

  function toggleConcealment() {
    if (!target) return;
    const state = useRAM.getState();
    updateTarget(
      isConcealed(target)
        ? revealCreature(target)
        : concealCreature(target, state.ruleDefinitions, state.customLibraryItems, "hidden")
    );
  }

  function giveItem() {
    if (!target) return;
    const item = libraryItems.find(
      (entry) => entry.id === (libraryItemId || sortedLibraryItems[0]?.id)
    );
    if (!item) return;
    updateTarget({
      inventory: [
        ...target.inventory,
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
          aria-label={`${target.name} actions`}
        >
          <header>
            <strong>{target.name}</strong>
            <small>
              {contextMenu.isPC ? "Player Character" : "Map Token"}
              {deathLabel ? ` · ${deathLabel}` : ""}
            </small>
          </header>

          {canRoll && (
            <section>
              <span>Roll for</span>
              <RamSelect
                value={rollFor}
                aria-label="Check to roll"
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
              <RamButton size="sm" icon={Dices} onClick={rollCheck}>
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
                <RamButton size="sm" icon={Skull} variant="danger" onClick={rollDeathSave}>
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
                onClick={() => {
                  const state = useRAM.getState();
                  if (contextMenu.isPC) state.duplicatePC(contextMenu.id);
                  else state.duplicateToken(contextMenu.id);
                  setContextMenu(null);
                }}
              >
                Duplicate
              </RamButton>
              <RamButton
                size="sm"
                icon={Trash2}
                variant="danger"
                onClick={() => {
                  setDeleteTarget({
                    id: contextMenu.id,
                    isPC: contextMenu.isPC,
                    name: target.name,
                  });
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
                onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))}
              />
              <RamButton size="sm" icon={Skull} variant="danger" onClick={() => adjustHp(-amount)}>
                Damage
              </RamButton>
              <RamButton size="sm" icon={HeartPulse} onClick={() => adjustHp(amount)}>
                Heal
              </RamButton>
            </div>
          </section>

          <section>
            <span>Effects</span>
            <RamSelect
              value={effectId}
              aria-label="Effect to add"
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
            <RamButton size="sm" icon={ShieldPlus} onClick={addEffect}>
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
            <RamButton size="sm" icon={PackagePlus} onClick={giveItem}>
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
    </div>
  );
}

export type { MapToken, PC };
