import { useEffect, useRef, useState } from 'react';

export type View = 'front' | 'back' | 'sleeveLeft' | 'sleeveRight';

export interface FlatItem {
  id: string | number;
  kind: 'image' | 'text';
  url?: string;
  text?: string;
  font?: string;
  size?: number;
  color?: string;
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  opacity?: number;
}

interface FlatViewEditorProps {
  view: View;
  items: FlatItem[];
  onChange: (items: FlatItem[]) => void;
  readOnly?: boolean;
  onSelect?: (id: string | number | null) => void;
  selectedId?: string | number | null;
}

const VIEW_SIZES: Record<View, { w: number; h: number }> = {
  front: { w: 1024, h: 1024 },
  back: { w: 1024, h: 1024 },
  sleeveLeft: { w: 512, h: 512 },
  sleeveRight: { w: 512, h: 512 },
};

const NO_GO: Record<View, { top: number }> = {
  front: { top: 0.12 },
  back: { top: 0.12 },
  sleeveLeft: { top: 0.2 },
  sleeveRight: { top: 0.2 },
};

const CORNERS = {
  TL: { x: 0.28, y: 0.28 },
  TR: { x: 0.72, y: 0.28 },
  BL: { x: 0.28, y: 0.78 },
  BR: { x: 0.72, y: 0.78 },
  C: { x: 0.5, y: 0.5 },
};

function clampY(y: number, view: View): number {
  const top = NO_GO[view].top;
  // clamp to below no-go band
  if (y < top) return top + 0.01;
  if (y > 1) return 1;
  return y;
}

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
  const size = VIEW_SIZES[view];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = size.w;
    const H = size.h;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    // Draw shirt silhouette outline guide (simple)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(W * 0.15, H * 0.15, W * 0.7, H * 0.7);
    ctx.stroke();

    // Draw collar no-go band
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    const topBand = NO_GO[view].top;
    ctx.fillRect(0, 0, W, H * topBand);

    // Draw items
    items.forEach((item) => {
      ctx.save();
      const cx = item.x * W;
      const cy = item.y * H;
      ctx.translate(cx, cy);
      ctx.rotate(((item.rotationDeg ?? 0) * Math.PI) / 180);
      const relScale = item.scale ?? 1;
      const viewWidth = 0.2 * W;
      const boxW = viewWidth * relScale;
      const boxH = boxW;
      ctx.globalAlpha = item.opacity ?? 1;
      if (selectedId === item.id) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4;
        ctx.strokeRect(-boxW / 2 - 4, -boxH / 2 - 4, boxW + 8, boxH + 8);
      }
      if (item.kind === 'image' && item.url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = item.url;
        if (img.complete && img.naturalWidth > 0) {
          const iw = img.naturalWidth;
          const ih = img.naturalHeight;
          const ratio = Math.min(boxW / iw, boxH / ih);
          const dw = iw * ratio;
          const dh = ih * ratio;
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        }
      } else if (item.kind === 'text' && item.text) {
        const fontSize = item.size ?? 60;
        const fontFam = item.font || 'Inter';
        ctx.font = `600 ${fontSize}px ${fontFam}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = item.color || '#ffffff';
        ctx.fillText(item.text, 0, 0);
        if (selectedId === item.id) {
          const metrics = ctx.measureText(item.text);
          ctx.strokeRect(
            -metrics.width / 2 - 4,
            -fontSize / 2 - 4,
            metrics.width + 8,
            fontSize + 8,
          );
        }
      }
      ctx.restore();
    });
  }, [items, view, size, selectedId]);

  const getItemAt = (px: number, py: number) => {
    const W = size.w;
    const H = size.h;
    // Check from topmost? reverse
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const cx = item.x * W;
      const cy = item.y * H;
      const relScale = item.scale ?? 1;
      const boxW = 0.2 * W * relScale;
      const boxH = boxW;
      // rough bounds
      if (Math.abs(px - cx) < boxW / 2 && Math.abs(py - cy) < boxH / 2) {
        return item;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const item = getItemAt(px, py);
    if (item) {
      onSelect?.(item.id);
      setDragging(item.id);
      const W = size.w;
      const H = size.h;
      setDragOffset({ x: item.x * W - px, y: item.y * H - py });
    } else {
      onSelect?.(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (readOnly || !dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const W = size.w;
    const H = size.h;
    const nx = (px + dragOffset.x) / W;
    const ny = (py + dragOffset.y) / H;
    const newItems = items.map((it) =>
      it.id === dragging ? { ...it, x: nx, y: clampY(ny, view) } : it,
    );
    onChange(newItems);
  };

  const handlePointerUp = () => {
    setDragging(null);
  };

  const quickPlace = (corner: keyof typeof CORNERS) => {
    if (readOnly || !selectedId) return;
    const pt = CORNERS[corner];
    const newItems = items.map((it) => (it.id === selectedId ? { ...it, x: pt.x, y: clampY(pt.y, view) } : it));
    onChange(newItems);
  };

  const updateSelected = (updates: Partial<FlatItem>) => {
    if (readOnly || !selectedId) return;
    const newItems = items.map((it) => (it.id === selectedId ? { ...it, ...updates } : it));
    onChange(newItems);
  };

  const moveLayer = (dir: -1 | 1) => {
    if (readOnly || !selectedId) return;
    const idx = items.findIndex((it) => it.id === selectedId);
    if (idx < 0) return;
    const newItems = [...items];
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const [item] = newItems.splice(idx, 1);
    newItems.splice(j, 0, item);
    onChange(newItems);
  };

  const deleteSelected = () => {
    if (readOnly || !selectedId) return;
    onChange(items.filter((it) => it.id !== selectedId));
    onSelect?.(null);
  };

  const selected = items.find((i) => i.id === selectedId);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full border border-rule bg-graphite"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {!readOnly && selected && (
        <div className="rounded-[6px] border border-rule bg-lacquer-deep p-3 space-y-3">
          <div className="flex flex-wrap gap-1">
            <button type="button" className="rounded border border-rule px-2 py-1 text-xs" onClick={() => quickPlace('C')}>Center</button>
            <button type="button" className="rounded border border-rule px-2 py-1 text-xs" onClick={() => quickPlace('TL')}>TL</button>
            <button type="button" className="rounded border border-rule px-2 py-1 text-xs" onClick={() => quickPlace('TR')}>TR</button>
            <button type="button" className="rounded border border-rule px-2 py-1 text-xs" onClick={() => quickPlace('BL')}>BL</button>
            <button type="button" className="rounded border border-rule px-2 py-1 text-xs" onClick={() => quickPlace('BR')}>BR</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              Scale
              <input
                type="range"
                min={0.3}
                max={3}
                step={0.01}
                value={selected.scale}
                onChange={(e) => updateSelected({ scale: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="text-xs">
              Rotation
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={selected.rotationDeg}
                onChange={(e) => updateSelected({ rotationDeg: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          </div>
          <div className="flex gap-1">
            <button type="button" className="rounded border border-rule px-2 py-1 text-xs" onClick={() => moveLayer(-1)}>Layer ↑</button>
            <button type="button" className="rounded border border-rule px-2 py-1 text-xs" onClick={() => moveLayer(1)}>Layer ↓</button>
            <button type="button" className="rounded border border-red-500 px-2 py-1 text-xs text-red-400" onClick={deleteSelected}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
