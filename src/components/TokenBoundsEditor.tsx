import type { CSSProperties } from "react";
import { tokenBoundsSize, type TokenCell } from "../types";

const GRID_SIZE = 9;
const GRID_RADIUS = Math.floor(GRID_SIZE / 2);

function cellKey(cell: TokenCell) {
  return `${cell.x}:${cell.y}`;
}

export function TokenBoundsEditor({
  bounds,
  image,
  color,
  disabled,
  onChange,
}: {
  bounds: TokenCell[];
  image?: string;
  color: string;
  disabled?: boolean;
  onChange: (bounds: TokenCell[]) => void;
}) {
  const occupied = new Set(bounds.map(cellKey));
  const size = tokenBoundsSize(bounds);
  const artStyle: CSSProperties = {
    backgroundImage: image ? `url("${image}")` : undefined,
    backgroundColor: image ? undefined : `color-mix(in srgb, ${color} 22%, transparent)`,
  };

  function toggle(cell: TokenCell) {
    const key = cellKey(cell);
    if (cell.x === 0 && cell.y === 0) return;
    const next = occupied.has(key)
      ? bounds.filter((entry) => cellKey(entry) !== key)
      : [...bounds, cell];
    if (next.length === 0) return;
    onChange(next.sort((a, b) => a.y - b.y || a.x - b.x));
  }

  return (
    <div className="token-bounds-editor">
      <div className="token-bounds-editor__copy">
        <span className="ram-field__label">Token Visual & Bounds</span>
        <small>Click cells to change occupied space. The centered visual stays one cell.</small>
      </div>
      <div
        className="token-bounds-grid"
        style={{ "--token-bound-color": color } as CSSProperties}
      >
        <span className="token-bounds-art" style={artStyle} aria-hidden="true" />
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
          const cell = {
            x: (index % GRID_SIZE) - GRID_RADIUS,
            y: Math.floor(index / GRID_SIZE) - GRID_RADIUS,
          };
          const selected = occupied.has(cellKey(cell));
          const origin = cell.x === 0 && cell.y === 0;
          return (
            <button
              type="button"
              key={cellKey(cell)}
              className={`${selected ? "is-selected" : ""}${origin ? " is-origin" : ""}`}
              disabled={disabled || origin}
              aria-label={
                origin
                  ? "Token visual anchor"
                  : `${selected ? "Remove" : "Add"} bounds cell ${cell.x}, ${cell.y}`
              }
              aria-pressed={selected}
              onClick={() => toggle(cell)}
            />
          );
        })}
      </div>
      <span className="token-bounds-size">
        {bounds.length} {bounds.length === 1 ? "cell" : "cells"} · {size.width}×{size.height}
      </span>
    </div>
  );
}
