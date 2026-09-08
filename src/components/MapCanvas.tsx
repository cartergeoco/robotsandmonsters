import { Copy, HeartPulse, PackagePlus, Pencil, ShieldPlus, Skull, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRAM } from "../store";
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_OPACITY,
  STATUS_EFFECT_PRESETS,
  normalizeGridOpacity,
  normalizeGridSize,
  rectangularTokenBounds,
  statusEffectColor,
  tokenDisplayName,
  type EnvironmentLighting,
  type MapToken,
  type PC,
  type StatusEffect,
  type TokenCell,
} from "../types";
import { RamButton, RamInput, RamSelect } from "./ui/RamPrimitives";

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
  return color;
}

const LIGHTING_OVERLAY: Record<EnvironmentLighting, { color: string; alpha: number }> = {
  daylight: { color: "246, 231, 195", alpha: 0.08 },
  overcast: { color: "138, 160, 184", alpha: 0.18 },
  dusk: { color: "212, 120, 58", alpha: 0.22 },
  night: { color: "11, 16, 32", alpha: 0.42 },
  torchlit: { color: "224, 138, 60", alpha: 0.18 },
  magical: { color: "122, 74, 212", alpha: 0.2 },
};

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
  selected?: boolean;
}

interface TokenContextMenu {
  id: string;
  isPC: boolean;
  x: number;
  y: number;
}

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [contextMenu, setContextMenu] = useState<TokenContextMenu | null>(null);
  const [effectId, setEffectId] = useState<
    (typeof STATUS_EFFECT_PRESETS)[number]["id"]
  >(STATUS_EFFECT_PRESETS[0].id);
  const [amount, setAmount] = useState(1);
  const [libraryItemId, setLibraryItemId] = useState("");
  const libraryItems = useRAM((state) => state.customLibraryItems);
  const pcs = useRAM((state) => state.pcs);
  const mapTokens = useRAM((state) => state.tokens);
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
    };

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let raf = 0;
    let hoverCellX = 0;
    let hoverCellY = 0;
    let hasHover = false;
    let disposed = false;
    let colors = { ...MAP_DEFAULTS };

    const imageCache = new Map<string, HTMLImageElement>();

    function readMapColors() {
      const rootStyle = getComputedStyle(document.documentElement);
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
        background: getComputedStyle(document.body).backgroundColor || MAP_DEFAULTS.background,
        accent: value("--ram-accent-bright", MAP_DEFAULTS.accent),
        named: value("--ram-named", MAP_DEFAULTS.named),
      };
    }

    function getImage(src: string): HTMLImageElement | null {
      let img = imageCache.get(src);
      if (!img) {
        img = new Image();
        img.src = src;
        img.onload = schedule;
        imageCache.set(src, img);
      }
      return img.complete && img.naturalWidth > 0 ? img : null;
    }

    function tokens(): Draggable[] {
      const s = useRAM.getState();
      const list: Draggable[] = [];
      for (const t of s.tokens) {
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
          width: t.width,
          height: t.height,
          bounds: t.bounds?.length ? t.bounds : rectangularTokenBounds(t.width, t.height),
        });
      }
      for (const p of s.pcs) {
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
          width: p.width,
          height: p.height,
          bounds: p.bounds?.length ? p.bounds : rectangularTokenBounds(p.width, p.height),
          selected: p.id === s.selectedPcId,
        });
      }
      return list;
    }

    function schedule() {
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
      schedule();
    }

    function drawToken(t: Draggable, zoom: number) {
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
      const radius = artSize * 0.12;
      const cx = artLeft + artSize / 2;
      const cy = artTop + artSize / 2;
      const img = t.image ? getImage(t.image) : null;

      ctx!.save();
      ctx!.beginPath();
      ctx!.roundRect(artLeft, artTop, artSize, artSize, radius);
      if (img) {
        ctx!.clip();
        const imageRatio = img.naturalWidth / img.naturalHeight;
        const drawWidth = imageRatio > 1 ? artSize * imageRatio : artSize;
        const drawHeight = imageRatio > 1 ? artSize : artSize / imageRatio;
        ctx!.drawImage(
          img,
          cx - drawWidth / 2,
          cy - drawHeight / 2,
          drawWidth,
          drawHeight
        );
      } else {
        ctx!.fillStyle = t.color + "33";
        ctx!.fill();
      }
      ctx!.restore();

      ctx!.save();
      ctx!.strokeStyle = t.color;
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

      if (artSize > 18 && t.statuses.length > 0) {
        const visibleStatuses = t.statuses.slice(0, 7);
        const dotRadius = Math.max(2.5, Math.min(5, artSize * 0.09));
        const gap = dotRadius * 2 + 2;
        const startX = cx - ((visibleStatuses.length - 1) * gap) / 2;
        const y = artTop + dotRadius + 3;
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
        ctx!.save();
        ctx!.strokeStyle = colors.accent;
        ctx!.lineWidth = Math.max(1.2, 1.5 * zoom);
        ctx!.beginPath();
        ctx!.roundRect(
          artLeft - inset * 0.45,
          artTop - inset * 0.45,
          artSize + inset * 0.9,
          artSize + inset * 0.9,
          radius
        );
        ctx!.stroke();
        ctx!.restore();
      }

      if (artSize > 24) {
        ctx!.fillStyle = t.named ? colors.named : colors.label;
        ctx!.font = `${t.named ? "italic " : ""}400 ${Math.max(12, 10 * Math.min(zoom, 1.4))}px ${getComputedStyle(document.body).fontFamily}`;
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
      }
    }

    function render() {
      raf = 0;
      if (disposed) return;
      const state = useRAM.getState();
      readMapColors();

      // Hover cell
      if (pointer.inside && !pan.active && !drag.active) {
        const w = toWorld(pointer.x, pointer.y);
        hoverCellX = Math.floor(w.x / mapCellPx());
        hoverCellY = Math.floor(w.y / mapCellPx());
        hasHover = true;
      } else {
        hasHover = false;
      }

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.fillStyle = colors.background;
      ctx!.fillRect(0, 0, cssW, cssH);

      const zoom = camera.zoom;
      const cellPx = mapCellPx() * zoom;

      // Background map image (world space, origin at 0,0)
      if (state.background) {
        const img = getImage(state.background.src);
        if (img) {
          const s = state.background.scale * zoom;
          ctx!.imageSmoothingEnabled = true;
          ctx!.imageSmoothingQuality = "high";
          ctx!.drawImage(
            img,
            -camera.x * zoom,
            -camera.y * zoom,
            img.naturalWidth * s,
            img.naturalHeight * s
          );
        }
      }

      const gridStep = stepForMin(cellPx, MIN_GRID_PX);
      const labelStep = stepForMin(cellPx, MIN_LABEL_PX);
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
        ctx!.fillStyle = colorWithAlpha(colors.hoverFill, gridOpacity * 0.5);
        ctx!.fillRect(hx, hy, cellPx, cellPx);
        ctx!.strokeStyle = colorWithAlpha(colors.hoverStroke, Math.min(1, gridOpacity * 2));
        ctx!.lineWidth = 1;
        ctx!.strokeRect(hair(hx), hair(hy), cellPx, cellPx);
      }

      ctx!.strokeStyle = colorWithAlpha(colors.grid, gridOpacity);
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

      // Major cartographic intervals remain visible without turning every
      // grid line into ornament.
      const majorStep = gridStep * 5;
      const majorColStart = Math.floor(camera.x / mapCellPx() / majorStep) * majorStep;
      const majorRowStart = Math.floor(camera.y / mapCellPx() / majorStep) * majorStep;
      ctx!.strokeStyle = colorWithAlpha(colors.gridMajor, Math.min(1, gridOpacity * 1.6));
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

      // World origin is a quiet brass crosshair.
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

      // Tokens
      for (const t of tokens()) drawToken(t, zoom);

      const lighting = LIGHTING_OVERLAY[state.lighting] ?? LIGHTING_OVERLAY.daylight;
      ctx!.fillStyle = `rgba(${lighting.color}, ${lighting.alpha})`;
      ctx!.fillRect(0, 0, cssW, cssH);

      // Rulers
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

      if (drag.active) {
        const w = toWorld(e.clientX, e.clientY);
        const nx = Math.round(w.x / mapCellPx() - drag.offX);
        const ny = Math.round(w.y / mapCellPx() - drag.offY);
        const s = useRAM.getState();
        if (drag.isPC) {
          const pc = s.pcs.find((p) => p.id === drag.id);
          if (pc && (pc.x !== nx || pc.y !== ny)) s.updatePC(drag.id, { x: nx, y: ny });
        } else {
          const t = s.tokens.find((t2) => t2.id === drag.id);
          if (t && (t.x !== nx || t.y !== ny)) s.updateToken(drag.id, { x: nx, y: ny });
        }
        schedule();
        return;
      }

      canvas!.classList.toggle("token-hover", tokenAt(e.clientX, e.clientY) !== null);
      schedule();
    }

    function onPointerDown(e: PointerEvent) {
      setContextMenu(null);
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
          try {
            canvas!.setPointerCapture(e.pointerId);
          } catch {
            /* best-effort */
          }
          if (hit.isPC) useRAM.getState().selectPC(hit.id);
        }
      }
    }

    function endInteraction(e: PointerEvent) {
      if (pan.active) {
        pan.active = false;
        canvas!.classList.remove("panning");
      }
      drag.active = false;
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
        setContextMenu(null);
        return;
      }
      setEffectId(STATUS_EFFECT_PRESETS[0].id);
      setAmount(1);
      setContextMenu({
        id: hit.id,
        isPC: hit.isPC,
        x: Math.max(8, Math.min(window.innerWidth - 276, e.clientX)),
        y: Math.max(8, Math.min(window.innerHeight - 420, e.clientY)),
      });
    };
    const closeContextMenu = () => setContextMenu(null);

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
    void document.fonts?.ready.then(schedule);

    const unsubHydrate = useRAM.persist.onFinishHydration(initCamera);
    if (useRAM.persist.hasHydrated()) initCamera();

    const unsub = useRAM.subscribe((s, prev) => {
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
        s.uiSettings !== prev.uiSettings
      ) {
        schedule();
      }
    });

    return () => {
      disposed = true;
      window.clearTimeout(persistCameraTimer);
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
    patch: Partial<Pick<PC, "hp" | "statuses" | "inventory">>
  ) {
    if (!contextMenu) return;
    const state = useRAM.getState();
    if (contextMenu.isPC) state.updatePC(contextMenu.id, patch);
    else state.updateToken(contextMenu.id, patch);
  }

  function adjustHp(delta: number) {
    if (!target) return;
    updateTarget({ hp: Math.max(0, Math.min(target.maxHp, target.hp + delta)) });
  }

  function addEffect() {
    if (!target) return;
    const preset =
      STATUS_EFFECT_PRESETS.find((entry) => entry.id === effectId) ??
      STATUS_EFFECT_PRESETS[0];
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
      <canvas ref={canvasRef} />
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
            <small>{contextMenu.isPC ? "Player Character" : "Map Token"}</small>
          </header>

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
                  if (!window.confirm(`Delete ${target.name}?`)) return;
                  const state = useRAM.getState();
                  if (contextMenu.isPC) state.deletePC(contextMenu.id);
                  else state.deleteToken(contextMenu.id);
                  setContextMenu(null);
                }}
              >
                Delete
              </RamButton>
            </div>
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
              value={libraryItemId || sortedLibraryItems[0]?.id || ""}
              onChange={(event) => setLibraryItemId(event.target.value)}
            >
              {sortedLibraryItems.map((item) => (
                <option value={item.id} key={item.id}>
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
    </div>
  );
}

export type { MapToken, PC };
