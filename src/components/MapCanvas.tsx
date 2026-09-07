import { useEffect, useRef } from "react";
import { useRAM } from "../store";
import type { MapToken, PC } from "../types";

const CELL = 48;
const GRID_COLOR = "rgba(230, 227, 221, 0.10)";
const LABEL_COLOR = "rgba(230, 227, 221, 0.22)";
const HOVER_FILL = "rgba(201, 168, 106, 0.08)";
const HOVER_STROKE = "rgba(201, 168, 106, 0.28)";
const BG_FILL = "#0f0f13";
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
  image?: string;
  hpFrac?: number;
}

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    const camera = { x: 0, y: 0, zoom: 1 };
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

    const imageCache = new Map<string, HTMLImageElement>();

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
          name: t.name,
          image: t.image,
          hpFrac:
            t.maxHp && t.maxHp > 0 && t.hp !== undefined
              ? Math.max(0, Math.min(1, t.hp / t.maxHp))
              : undefined,
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
          image: p.image,
          hpFrac: p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : undefined,
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
      const r = CELL * 0.42;
      for (let i = list.length - 1; i >= 0; i--) {
        const t = list[i];
        const cx = (t.x + 0.5) * CELL;
        const cy = (t.y + 0.5) * CELL;
        if ((w.x - cx) ** 2 + (w.y - cy) ** 2 <= r * r) return t;
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
      const cx = ((t.x + 0.5) * CELL - camera.x) * zoom;
      const cy = ((t.y + 0.5) * CELL - camera.y) * zoom;
      const r = CELL * 0.42 * zoom;
      if (cx < -r || cy < -r || cx > cssW + r || cy > cssH + r) return;

      const img = t.image ? getImage(t.image) : null;

      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, r, 0, Math.PI * 2);
      if (img) {
        ctx!.clip();
        ctx!.drawImage(img, cx - r, cy - r, r * 2, r * 2);
        ctx!.restore();
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.strokeStyle = t.color;
        ctx!.lineWidth = Math.max(1.5, 2.5 * zoom);
        ctx!.stroke();
      } else {
        ctx!.fillStyle = t.color + "33";
        ctx!.fill();
        ctx!.strokeStyle = t.color;
        ctx!.lineWidth = Math.max(1.2, 2 * zoom);
        ctx!.stroke();
        if (r > 7) {
          ctx!.fillStyle = t.color;
          ctx!.font = `600 ${Math.max(9, r * 0.72)}px ${getComputedStyle(document.body).fontFamily}`;
          ctx!.textAlign = "center";
          ctx!.textBaseline = "middle";
          ctx!.fillText(t.name.slice(0, 1).toUpperCase(), cx, cy + r * 0.03);
        }
      }
      ctx!.restore();

      // Name + HP under the token when zoomed in enough
      if (r > 12) {
        ctx!.fillStyle = LABEL_COLOR;
        ctx!.font = `500 ${Math.max(9, 10 * Math.min(zoom, 1.4))}px ${getComputedStyle(document.body).fontFamily}`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "top";
        ctx!.fillText(t.name, cx, cy + r + 3);
        if (t.hpFrac !== undefined) {
          const bw = r * 1.6;
          const bh = 3;
          const by = cy + r + (10 * Math.min(zoom, 1.4) + 6);
          ctx!.fillStyle = "rgba(255,255,255,0.10)";
          ctx!.fillRect(cx - bw / 2, by, bw, bh);
          ctx!.fillStyle =
            t.hpFrac > 0.5 ? "#8fb996" : t.hpFrac > 0.25 ? "#c9a86a" : "#b0524f";
          ctx!.fillRect(cx - bw / 2, by, bw * t.hpFrac, bh);
        }
      }
    }

    function render() {
      raf = 0;
      if (disposed) return;
      const state = useRAM.getState();

      // Hover cell
      if (pointer.inside && !pan.active && !drag.active) {
        const w = toWorld(pointer.x, pointer.y);
        hoverCellX = Math.floor(w.x / CELL);
        hoverCellY = Math.floor(w.y / CELL);
        hasHover = true;
      } else {
        hasHover = false;
      }

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.fillStyle = BG_FILL;
      ctx!.fillRect(0, 0, cssW, cssH);

      const zoom = camera.zoom;
      const cellPx = CELL * zoom;

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
      const colStart = Math.floor(camera.x / CELL / gridStep) * gridStep;
      const colEnd = Math.floor(worldRight / CELL);
      const rowStart = Math.floor(camera.y / CELL / gridStep) * gridStep;
      const rowEnd = Math.floor(worldBottom / CELL);

      if (hasHover) {
        const hx = (hoverCellX * CELL - camera.x) * zoom;
        const hy = (hoverCellY * CELL - camera.y) * zoom;
        ctx!.fillStyle = HOVER_FILL;
        ctx!.fillRect(hx, hy, cellPx, cellPx);
        ctx!.strokeStyle = HOVER_STROKE;
        ctx!.lineWidth = 1;
        ctx!.strokeRect(hair(hx), hair(hy), cellPx, cellPx);
      }

      ctx!.strokeStyle = GRID_COLOR;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (let col = colStart; col <= colEnd; col += gridStep) {
        const x = hair((col * CELL - camera.x) * zoom);
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, cssH);
      }
      for (let row = rowStart; row <= rowEnd; row += gridStep) {
        const y = hair((row * CELL - camera.y) * zoom);
        ctx!.moveTo(0, y);
        ctx!.lineTo(cssW, y);
      }
      ctx!.stroke();

      // Tokens
      for (const t of tokens()) drawToken(t, zoom);

      // Rulers
      ctx!.fillStyle = BG_FILL;
      ctx!.fillRect(0, 0, cssW, RULER_TOP);
      ctx!.fillRect(0, 0, RULER_LEFT, cssH);
      ctx!.strokeStyle = GRID_COLOR;
      ctx!.beginPath();
      ctx!.moveTo(hair(RULER_LEFT), RULER_TOP);
      ctx!.lineTo(hair(RULER_LEFT), cssH);
      ctx!.moveTo(RULER_LEFT, hair(RULER_TOP));
      ctx!.lineTo(cssW, hair(RULER_TOP));
      ctx!.stroke();

      ctx!.fillStyle = LABEL_COLOR;
      ctx!.font = "100 8px system-ui, 'Segoe UI', sans-serif";
      ctx!.textBaseline = "middle";
      const labelColStart = Math.floor(camera.x / CELL / labelStep) * labelStep;
      const labelRowStart = Math.floor(camera.y / CELL / labelStep) * labelStep;

      ctx!.textAlign = "center";
      for (let col = labelColStart; col <= colEnd; col += labelStep) {
        const x = (col * CELL - camera.x) * zoom + cellPx * 0.5;
        if (x < RULER_LEFT - 4 || x > cssW + 4) continue;
        ctx!.fillText(String(col), x, RULER_TOP * 0.5);
      }
      ctx!.textAlign = "right";
      for (let row = labelRowStart; row <= rowEnd; row += labelStep) {
        const y = (row * CELL - camera.y) * zoom + cellPx * 0.5;
        if (y < RULER_TOP - 4 || y > cssH + 4) continue;
        ctx!.fillText(String(row), RULER_LEFT - 6, y);
      }
      ctx!.fillStyle = BG_FILL;
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
        schedule();
        return;
      }

      if (drag.active) {
        const w = toWorld(e.clientX, e.clientY);
        const nx = Math.round(w.x / CELL - 0.5 - drag.offX);
        const ny = Math.round(w.y / CELL - 0.5 - drag.offY);
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
          drag.offX = w.x / CELL - 0.5 - hit.x;
          drag.offY = w.y / CELL - 0.5 - hit.y;
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

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", endInteraction);
    canvas.addEventListener("pointercancel", endInteraction);
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousedown", blockAux);
    canvas.addEventListener("auxclick", blockAux);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();

    camera.x = (-cssW / camera.zoom + CELL) * 0.5;
    camera.y = (-cssH / camera.zoom + CELL) * 0.5;
    schedule();

    const unsub = useRAM.subscribe((s, prev) => {
      if (
        s.pcs !== prev.pcs ||
        s.tokens !== prev.tokens ||
        s.background !== prev.background
      ) {
        schedule();
      }
    });

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      unsub();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", endInteraction);
      canvas.removeEventListener("pointercancel", endInteraction);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", blockAux);
      canvas.removeEventListener("auxclick", blockAux);
    };
  }, []);

  return (
    <div className="map-layer">
      <canvas ref={canvasRef} />
    </div>
  );
}

export type { MapToken, PC };
