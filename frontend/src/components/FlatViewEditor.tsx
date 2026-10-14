import { useCallback, useEffect, useRef, useState } from 'react';
import {
  alignItem,
  clampCrop,
  clampInto,
  drawFlatItems,
  drawSilhouetteAndBand,
  itemBoxPx,
  printableBounds,
  snapCenter,
  type AlignKind,
  type CropRect,
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
const HANDLE_R = 26;
const MIN_PX = 8;

type DragMode =
  | { kind: 'move'; id: string | number; dx: number; dy: number }
  | { kind: 'resize'; id: string | number; corner: 'tl' | 'tr' | 'bl' | 'br'; startW: number; startH: number; startPx: number; startPy: number; ratio: number }
  | { kind: 'crop'; startPx: number; startPy: number };

const ALIGN_BUTTONS: Array<{ kind: AlignKind; label: string }> = [
  { kind: 'left', label: 'Align Left' },
  { kind: 'centerH', label: 'Center H' },
  { kind: 'right', label: 'Align Right' },
  { kind: 'top', label: 'Align Top' },
  { kind: 'middleV', label: 'Middle V' },
  { kind: 'bottom', label: 'Align Bottom' },
];

export default function FlatViewEditor({
  view,
  items,
  onChange,
  readOnly = false,
  onSelect,
  selectedId,
}: FlatViewEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [snap, setSnap] = useState<{ h: boolean; v: boolean }>({ h: false, v: false });
  const [cropMode, setCropMode] = useState(false);
  const [cropDraft, setCropDraft] = useState<CropRect | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const selected = items.find((it) => it.id === selectedId) ?? null;
  const selectedLocked = selected?.locked === true;

  const emit = useCallback(
    (next: FlatItem[]) => {
      onChange(next);
    },
    [onChange],
  );

  // Redraw whenever items/selection/crop/snap change — also after images finish loading.
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
      // Snap guides: center H/V dashed lines
      if (snap.h || snap.v) {
        const b = printableBounds(view);
        ctx.save();
        ctx.strokeStyle = '#f0b45a';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        if (snap.v) {
          const x = ((b.x0 + b.x1) / 2) * W;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
          ctx.stroke();
        }
        if (snap.h) {
          const y = ((b.y0 + b.y1) / 2) * H;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
        ctx.restore();
      }
      for (const item of items) {
        if (item.visible === false) continue;
        if (selectedId === item.id) {
          ctx.save();
          ctx.translate(item.x * W, item.y * H);
          ctx.rotate(((item.rotationDeg ?? 0) * Math.PI) / 180);
          const box = itemBoxPx(W, item);
          ctx.strokeStyle = '#f0b45a';
          ctx.lineWidth = 5;
          ctx.strokeRect(-box.w / 2 - 5, -box.h / 2 - 5, box.w + 10, box.h + 10);
          // Corner drag handles (drawn unrotated boxes at corners for hit clarity)
          if (!readOnly && !cropMode) {
            ctx.fillStyle = '#f0b45a';
            const r = HANDLE_R;
            for (const [hx, hy] of [
              [-box.w / 2, -box.h / 2],
              [box.w / 2, -box.h / 2],
              [-box.w / 2, box.h / 2],
              [box.w / 2, box.h / 2],
            ]) {
              ctx.fillRect(hx - r / 2, hy - r / 2, r, r);
            }
          }
          ctx.restore();
        }
      }
      // Crop overlay for the selected image item
      if (cropMode && selected && selected.kind === 'image') {
        const box = itemBoxPx(W, selected);
        const cx = selected.x * W;
        const cy = selected.y * H;
        const draft = cropDraft ?? selected.crop ?? { cx: 0, cy: 0, cw: 1, ch: 1 };
        ctx.save();
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(cx - box.w / 2, cy - box.h / 2, box.w, box.h);
        ctx.setLineDash([]);
        const rx = cx - box.w / 2 + draft.cx * box.w;
        const ry = cy - box.h / 2 + draft.cy * box.h;
        const rw = draft.cw * box.w;
        const rh = draft.ch * box.h;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        // dim outside the crop rect (4 rects)
        ctx.fillRect(cx - box.w / 2, cy - box.h / 2, box.w, ry - (cy - box.h / 2));
        ctx.fillRect(cx - box.w / 2, ry + rh, box.w, cy + box.h / 2 - (ry + rh));
        ctx.fillRect(cx - box.w / 2, ry, rx - (cx - box.w / 2), rh);
        ctx.fillRect(rx + rw, ry, cx + box.w / 2 - (rx + rw), rh);
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 3;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();
      }
    };
    paint();
  }, [items, view, selectedId, snap, cropMode, cropDraft, selected, readOnly]);

  const toCanvasPx = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_W / rect.width;
    return {
      px: (e.clientX - rect.left) * scale,
      py: (e.clientY - rect.top) * scale,
    };
  };

  const hitHandle = (item: FlatItem, px: number, py: number): 'tl' | 'tr' | 'bl' | 'br' | null => {
    const box = itemBoxPx(CANVAS_W, item);
    const cx = item.x * CANVAS_W;
    const cy = item.y * CANVAS_W;
    // Account for rotation: transform point into item space
    const rot = ((item.rotationDeg ?? 0) * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
    const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
    const corners: Array<['tl' | 'tr' | 'bl' | 'br', number, number]> = [
      ['tl', -box.w / 2, -box.h / 2],
      ['tr', box.w / 2, -box.h / 2],
      ['bl', -box.w / 2, box.h / 2],
      ['br', box.w / 2, box.h / 2],
    ];
    for (const [key, hx, hy] of corners) {
      if (Math.abs(lx - hx) <= HANDLE_R && Math.abs(ly - hy) <= HANDLE_R) return key;
    }
    return null;
  };

  const getItemAt = (px: number, py: number): FlatItem | null => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.visible === false) continue;
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
    const { px, py } = toCanvasPx(e);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    // Crop mode: start a crop rect drag
    if (cropMode && selected && selected.kind === 'image') {
      setDrag({ kind: 'crop', startPx: px, startPy: py });
      setCropDraft(selected.crop ?? { cx: 0, cy: 0, cw: 1, ch: 1 });
      return;
    }
    // Resize handles first (selected, unlocked)
    if (selected && !selectedLocked) {
      const h = hitHandle(selected, px, py);
      if (h) {
        const box = itemBoxPx(CANVAS_W, selected);
        setDrag({
          kind: 'resize',
          id: selected.id,
          corner: h,
          startW: box.w,
          startH: box.h,
          startPx: px,
          startPy: py,
          ratio: box.w / Math.max(1, box.h),
        });
        return;
      }
    }
    const item = getItemAt(px, py);
    if (item) {
      onSelect?.(item.id);
      if (item.locked) {
        setDrag(null);
        return;
      }
      setDrag({ kind: 'move', id: item.id, dx: item.x * CANVAS_W - px, dy: item.y * CANVAS_W - py });
    } else {
      onSelect?.(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !drag) return;
    const { px, py } = toCanvasPx(e);
    const cur = itemsRef.current;
    if (drag.kind === 'move') {
      const target = cur.find((it) => it.id === drag.id);
      if (!target || target.locked) return;
      const raw = {
        x: (px + drag.dx) / CANVAS_W,
        y: (py + drag.dy) / CANVAS_W,
      };
      const clamped = clampInto(view, raw.x, raw.y);
      emit(cur.map((it) => (it.id === drag.id ? { ...it, x: clamped.x, y: clamped.y } : it)));
      // live snap hint (applied on release)
      const s = snapCenter(view, clamped.x, clamped.y);
      setSnap({ h: s.snapH, v: s.snapV });
    } else if (drag.kind === 'resize') {
      const target = cur.find((it) => it.id === drag.id);
      if (!target || target.locked) return;
      const dx = px - drag.startPx;
      const dy = py - drag.startPy;
      // project onto the drag diagonal
      const sx = drag.corner === 'tl' || drag.corner === 'bl' ? -1 : 1;
      const sy = drag.corner === 'tl' || drag.corner === 'tr' ? -1 : 1;
      const delta = (dx * sx + dy * sy) / 2;
      let nw = Math.max(MIN_PX, drag.startW + delta * 2);
      let nh = Math.max(MIN_PX, drag.startH + delta * 2);
      const lockAspect = (target.lockAspect ?? true) && target.kind === 'image';
      if (lockAspect) {
        // grow uniformly by width, keep ratio
        nh = Math.max(MIN_PX, nw / drag.ratio);
      }
      const k = CANVAS_W / 1024;
      emit(
        cur.map((it) =>
          it.id === drag.id ? { ...it, w: nw / k, h: nh / k, scale: nw / (0.2 * CANVAS_W) } : it,
        ),
      );
    } else if (drag.kind === 'crop' && selected) {
      const box = itemBoxPx(CANVAS_W, selected);
      const cx = selected.x * CANVAS_W;
      const cy = selected.y * CANVAS_W;
      const x0 = Math.min(drag.startPx, px);
      const y0 = Math.min(drag.startPy, py);
      const x1 = Math.max(drag.startPx, px);
      const y1 = Math.max(drag.startPy, py);
      const draft = clampCrop({
        cx: (x0 - (cx - box.w / 2)) / box.w,
        cy: (y0 - (cy - box.h / 2)) / box.h,
        cw: (x1 - x0) / box.w,
        ch: (y1 - y0) / box.h,
      });
      setCropDraft(draft);
    }
  };

  const onPointerUp = () => {
    if (drag?.kind === 'move') {
      // snap on release: center H/V within 6px
      const cur = itemsRef.current;
      const target = cur.find((it) => it.id === drag.id);
      if (target) {
        const s = snapCenter(view, target.x, target.y);
        if (s.snapH || s.snapV) {
          emit(cur.map((it) => (it.id === drag.id ? { ...it, x: s.x, y: s.y } : it)));
        }
      }
    }
    setDrag(null);
    setSnap({ h: false, v: false });
  };

  const quickPlace = (corner: CornerKey) => {
    if (readOnly || selectedId == null || selectedLocked) return;
    const p = CORNERS[corner];
    const { x, y } = clampInto(view, p.x, p.y);
    emit(items.map((it) => (it.id === selectedId ? { ...it, x, y } : it)));
  };

  const doAlign = (kind: AlignKind) => {
    if (readOnly || !selected || selectedLocked) return;
    const { x, y } = alignItem(view, selected, kind);
    emit(items.map((it) => (it.id === selected.id ? { ...it, x, y } : it)));
  };

  const updateSelected = (updates: Partial<FlatItem>) => {
    if (readOnly || selectedId == null || selectedLocked) return;
    emit(items.map((it) => (it.id === selectedId ? { ...it, ...updates } : it)));
  };

  const rotateBy = (deg: number) => {
    if (readOnly || !selected || selectedLocked) return;
    let next = (selected.rotationDeg ?? 0) + deg;
    while (next > 180) next -= 360;
    while (next < -180) next += 360;
    emit(items.map((it) => (it.id === selected.id ? { ...it, rotationDeg: next } : it)));
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
    emit(arr);
  };

  const deleteSelected = () => {
    if (readOnly || selectedId == null) return;
    emit(items.filter((it) => it.id !== selectedId));
    onSelect?.(null);
  };

  const toggleFlag = (id: string | number, flag: 'visible' | 'locked') => {
    if (readOnly) return;
    emit(
      items.map((it) =>
        it.id === id
          ? flag === 'visible'
            ? { ...it, visible: (it.visible ?? true) ? false : true }
            : { ...it, locked: !(it.locked ?? false) }
          : it,
      ),
    );
  };

  // Keyboard: arrows nudge (1px, shift=10px), Delete removes.
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (selectedId == null || selectedLocked) return;
      const step = (e.shiftKey ? 10 : 1) / CANVAS_W;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      } else return;
      e.preventDefault();
      const cur = itemsRef.current;
      const t = cur.find((it) => it.id === selectedId);
      if (!t) return;
      const c = clampInto(view, t.x + dx, t.y + dy);
      emit(cur.map((it) => (it.id === selectedId ? { ...it, x: c.x, y: c.y } : it)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, selectedId, selectedLocked, view]);

  const applyCrop = () => {
    if (!selected || !cropDraft) return;
    emit(items.map((it) => (it.id === selected.id ? { ...it, crop: cropDraft } : it)));
    setCropMode(false);
    setCropDraft(null);
  };

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
    <div className="space-y-2" ref={wrapRef}>
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
        role="application"
        aria-label={`Flat editor for ${view}. Drag items to move, drag corners to resize.`}
      />
      {/* Multi-item list panel per view */}
      <div className="rounded-[6px] border border-rule bg-lacquer-deep p-2" aria-label={`Layers in ${view}`}>
        <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Layers — {view} ({items.length})
        </div>
        {items.length === 0 ? (
          <p className="px-1 py-2 text-xs text-faint">No items on this view yet.</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {[...items].reverse().map((it) => {
              const active = it.id === selectedId;
              return (
                <li
                  key={String(it.id)}
                  className={`flex min-h-[44px] items-center gap-1.5 rounded-[4px] border px-1.5 py-1 text-sm ${active ? 'border-gold' : 'border-rule'}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect?.(active ? null : it.id)}
                    className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
                    aria-label={`Select layer ${it.kind === 'image' ? 'image' : it.text || 'text'}`}
                    aria-pressed={active}
                  >
                    {it.kind === 'image' && it.url ? (
                      <img
                        src={it.url}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-[3px] border border-rule bg-graphite object-contain"
                        crossOrigin="anonymous"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-rule bg-graphite text-[11px] font-semibold" style={{ color: it.color || '#fff' }}>
                        T
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {it.kind === 'image' ? 'image' : it.text || 'text'}
                      {it.visible === false ? ' (hidden)' : ''}
                      {it.locked ? ' (locked)' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFlag(it.id, 'visible')}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[4px] text-xs hover:bg-graphite"
                    aria-label={`${(it.visible ?? true) ? 'Hide' : 'Show'} layer`}
                    aria-pressed={!(it.visible ?? true)}
                  >
                    {(it.visible ?? true) ? '👁' : '🚫'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFlag(it.id, 'locked')}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[4px] text-xs hover:bg-graphite"
                    aria-label={`${it.locked ? 'Unlock' : 'Lock'} layer`}
                    aria-pressed={!!it.locked}
                  >
                    {it.locked ? '🔒' : '🔓'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect?.(it.id);
                      moveLayer(-1);
                    }}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[4px] text-xs hover:bg-graphite"
                    aria-label="Move layer down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect?.(it.id);
                      moveLayer(1);
                    }}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[4px] text-xs hover:bg-graphite"
                    aria-label="Move layer up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect?.(it.id);
                      emit(items.filter((x) => x.id !== it.id));
                      if (active) onSelect?.(null);
                    }}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[4px] text-xs text-vermilion hover:bg-vermilion/10"
                    aria-label="Delete layer"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selected ? (
        <div className="space-y-3 rounded-[6px] border border-rule bg-lacquer-deep p-3">
          <div className="flex flex-wrap gap-1">
            {(Object.keys(CORNERS) as CornerKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => quickPlace(key)}
                disabled={selectedLocked}
                aria-label={`Quick place ${key} in ${view}`}
                className="min-h-[44px] rounded-[4px] border border-rule bg-graphite px-3 py-1 text-xs font-medium text-warm hover:border-rule-strong disabled:opacity-50"
              >
                {key === 'C' ? 'Center' : key === 'TL' ? 'Top-Left' : key === 'TR' ? 'Top-Right' : key === 'BL' ? 'Bottom-Left' : 'Bottom-Right'}
              </button>
            ))}
          </div>
          {/* RLTB align toolbar */}
          <div role="toolbar" aria-label="Align selected item" className="flex flex-wrap gap-1">
            {ALIGN_BUTTONS.map((b) => (
              <button
                key={b.kind}
                type="button"
                onClick={() => doAlign(b.kind)}
                disabled={selectedLocked}
                aria-label={`${b.label} relative to printable area`}
                className="min-h-[44px] rounded-[4px] border border-rule bg-graphite px-3 py-1 text-xs font-medium text-warm hover:border-rule-strong disabled:opacity-50"
              >
                {b.label}
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
                disabled={selectedLocked}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  const box = itemBoxPx(CANVAS_W, selected);
                  const k = itemBoxPx(CANVAS_W, { ...selected, scale: 1 });
                  const ratio = box.w / Math.max(1, k.w);
                  void ratio;
                  updateSelected({ scale: s, w: undefined, h: undefined });
                }}
                className="h-[44px] w-full cursor-pointer"
                aria-label="Item scale"
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
                disabled={selectedLocked}
                onChange={(e) => updateSelected({ rotationDeg: Number(e.target.value) })}
                className="h-[44px] w-full cursor-pointer"
                aria-label="Item rotation degrees"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => rotateBy(-90)} disabled={selectedLocked} aria-label="Rotate minus 90 degrees" className={btnLocal}>−90°</button>
            <button type="button" onClick={() => rotateBy(90)} disabled={selectedLocked} aria-label="Rotate plus 90 degrees" className={btnLocal}>+90°</button>
            {selected.kind === 'image' ? (
              <button
                type="button"
                onClick={() => {
                  setCropMode((m) => !m);
                  setCropDraft(selected.crop ?? { cx: 0, cy: 0, cw: 1, ch: 1 });
                }}
                aria-label={cropMode ? 'Exit crop mode' : 'Enter crop mode'}
                aria-pressed={cropMode}
                className={`${btnLocal} ${cropMode ? 'border-sky-400 text-sky-300' : ''}`}
              >
                {cropMode ? 'Crop: on (drag on canvas)' : 'Crop'}
              </button>
            ) : null}
            {selected.kind === 'image' ? (
              <button
                type="button"
                onClick={() => updateSelected({ lockAspect: !(selected.lockAspect ?? true) })}
                aria-label={`Aspect lock ${selected.lockAspect ?? true ? 'on' : 'off'}`}
                aria-pressed={selected.lockAspect ?? true}
                className={btnLocal}
              >
                Aspect {(selected.lockAspect ?? true) ? '🔒' : '🔓'}
              </button>
            ) : null}
          </div>
          {cropMode && selected.kind === 'image' ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-sky-400/40 bg-sky-400/5 p-2">
              <span className="text-xs text-muted">Drag a rect on the canvas, then Apply.</span>
              <button type="button" onClick={applyCrop} aria-label="Apply crop" className={`${btnLocal} border-sky-400 text-sky-300`}>Apply</button>
              <button
                type="button"
                onClick={() => {
                  setCropMode(false);
                  setCropDraft(null);
                }}
                aria-label="Cancel crop"
                className={btnLocal}
              >
                Cancel
              </button>
              {selected.crop ? (
                <button type="button" onClick={() => updateSelected({ crop: null })} aria-label="Reset crop" className={btnLocal}>
                  Reset
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => moveLayer(-1)} aria-label="Move layer down" className={btnLocal}>Layer ↑</button>
            <button type="button" onClick={() => moveLayer(1)} aria-label="Move layer up" className={btnLocal}>Layer ↓</button>
            <button type="button" onClick={deleteSelected} aria-label="Delete selected item" className={btnLocalDanger}>Delete</button>
          </div>
          <p className="text-[11px] text-faint">Arrows nudge 1px (⇧=10px) · Del removes · drag corners to resize · snap guides at center.</p>
        </div>
      ) : null}
    </div>
  );
}

const btnLocal = 'min-h-[44px] rounded-[4px] border border-rule bg-graphite px-3 py-1 text-xs font-medium text-warm hover:border-rule-strong disabled:opacity-50';
const btnLocalDanger = 'min-h-[44px] rounded-[4px] border border-vermilion/40 bg-vermilion/10 px-3 py-1 text-xs font-medium text-vermilion hover:border-vermilion';
