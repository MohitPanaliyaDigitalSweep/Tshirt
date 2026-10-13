import { useEffect, useRef, useState } from 'react';
import {
  clampInto,
  drawFlatItems,
  drawSilhouetteAndBand,
  itemBoxPx,
  type View,
  type FlatItem,
} from '../lib/flat';

interface FlatViewEditorProps {
  view: View;
  items: FlatItem[];
  onChange: (items: FlatItem[]) => void;
  readOnly?: boolean;
  onSelect?: (id: string | number | null) => void;
  selectedId?: string | number | null;
}

export const CORNERS = {
  TL: { x: 0.28, y: 0.28 },
  TR: { x: 0.72, y: 0.28 },
  BL: { x: 0.28, y: 0.78 },
  BR: { x: 0.72, y: 0.78 },
  C: { x: 0.5, y: 0.5 },
} as const;
export type CornerKey = keyof typeof CORNERS;

export const CANVAS_W = 1024;

export default function FlatViewEditor({
  view,
  items,
  onChange,
  readOnly = false,
  onSelect,
  selectedId,
}: FlatViewEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<string | number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Redraw whenever items/selection change — also after images finish loading.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    const paint = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawSilhouetteAndBand(ctx, W, H, view);
      drawFlatItems(ctx, W, H, items, paint);
      for (const item of items) {
        if (selectedId === item.id) {
          ctx.save();
          ctx.translate(item.x * W, item.y * H);
          ctx.rotate(((item.rotationDeg ?? 0) * Math.PI) / 180);
          const box = itemBoxPx(W, item);
          ctx.strokeStyle = '#f0b45a';
          ctx.lineWidth = 5;
          ctx.strokeRect(-box.w / 2 - 5, -box.h / 2 - 5, box.w + 10, box.h + 10);
          ctx.restore();
        }
      }
    };
    paint();
  }, [items, view, selectedId]);

  const getItemAt = (px: number, py: number): FlatItem | null => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const box = itemBoxPx(CANVAS_W, item);
      const cx = item.x * CANVAS_W;
      const cy = item.y * CANVAS_W;
      if (Math.abs(px - cx) <= box.w / 2 + 5 && Math.abs(py - cy) <= box.h / 2 + 5) {
        return item;
      }
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_W / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    const item = getItemAt(px, py);
    if (item) {
      onSelect?.(item.id);
      setDragging(item.id);
      setDragOffset({ x: item.x * CANVAS_W - px, y: item.y * CANVAS_W - py });
    } else {
      onSelect?.(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || dragging == null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_W / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    const { x, y } = clampInto(view, (px + dragOffset.x) / CANVAS_W, (py + dragOffset.y) / CANVAS_W);
    onChange(items.map((it) => (it.id === dragging ? { ...it, x, y } : it)));
  };

  const onPointerUp = () => setDragging(null);

  const quickPlace = (corner: CornerKey) => {
    if (readOnly || selectedId == null) return;
    const p = CORNERS[corner];
    const { x, y } = clampInto(view, p.x, p.y);
    onChange(items.map((it) => (it.id === selectedId ? { ...it, x, y } : it)));
  };

  const updateSelected = (updates: Partial<FlatItem>) => {
    if (readOnly || selectedId == null) return;
    onChange(items.map((it) => (it.id === selectedId ? { ...it, ...updates } : it)));
  };

  const moveLayer = (dir: -1 | 1) => {
    if (readOnly || selectedId == null) return;
    const idx = items.findIndex((it) => it.id === selectedId);
    if (idx < 0) return;
    const arr = [...items];
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const [item] = arr.splice(idx, 1);
    arr.splice(j, 0, item);
    onChange(arr);
  };

  const deleteSelected = () => {
    if (readOnly || selectedId == null) return;
    onChange(items.filter((it) => it.id !== selectedId));
    onSelect?.(null);
  };

  const selected = items.find((it) => it.id === selectedId);

  if (readOnly) {
    return (
      <div className="space-y-2">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_W} className="w-full border border-rule bg-graphite" />
        <ul className="space-y-1">
          {items.length === 0 ? <li className="text-xs text-faint">—</li> : null}
          {items.map((it) => (
            <li key={String(it.id)} className="flex items-center gap-2 rounded-[4px] border border-rule px-2 py-1 text-sm">
              {it.kind === 'image' && it.url ? (
                <img
                  src={it.url}
                  alt="artwork"
                  className="h-8 w-8 shrink-0 rounded-[3px] border border-rule bg-graphite object-contain"
                  crossOrigin="anonymous"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-rule bg-graphite text-[11px] font-semibold" style={{ color: it.color || '#fff' }}>
                  T
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">
                {it.kind === 'image' ? 'image' : it.text || 'text'}
              </span>
              <span className="text-[11px] text-muted">({Math.round(it.x * 100)}%, {Math.round(it.y * 100)}%)</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_W}
        className="w-full border border-rule bg-graphite"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      {selected ? (
        <div className="space-y-3 rounded-[6px] border border-rule bg-lacquer-deep p-3">
          <div className="flex flex-wrap gap-1">
            {(Object.keys(CORNERS) as CornerKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => quickPlace(key)}
                className="rounded-[4px] border border-rule bg-graphite px-2 py-1 text-xs font-medium text-warm hover:border-rule-strong"
              >
                {key === 'C' ? 'Center' : key === 'TL' ? 'Top-Left' : key === 'TR' ? 'Top-Right' : key === 'BL' ? 'Bottom-Left' : 'Bottom-Right'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                <span>Scale</span>
                <span className="font-mono normal-case">{selected.scale.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0.3}
                max={3}
                step={0.01}
                value={selected.scale}
                onChange={(e) => updateSelected({ scale: Number(e.target.value) })}
                className="h-[36px] w-full cursor-pointer"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                <span>Rotation</span>
                <span className="font-mono normal-case">{selected.rotationDeg.toFixed(0)}°</span>
              </span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={selected.rotationDeg}
                onChange={(e) => updateSelected({ rotationDeg: Number(e.target.value) })}
                className="h-[36px] w-full cursor-pointer"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => moveLayer(-1)} className={btnLocal}>Layer ↑</button>
            <button type="button" onClick={() => moveLayer(1)} className={btnLocal}>Layer ↓</button>
            <button type="button" onClick={deleteSelected} className={btnLocalDanger}>Delete</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const btnLocal = 'rounded-[4px] border border-rule bg-graphite px-2 py-1 text-xs font-medium text-warm hover:border-rule-strong';
const btnLocalDanger = 'rounded-[4px] border border-vermilion/40 bg-vermilion/10 px-2 py-1 text-xs font-medium text-vermilion hover:border-vermilion';