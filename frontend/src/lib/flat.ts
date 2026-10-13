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

export interface Views {
  front: { items: FlatItem[] };
  back: { items: FlatItem[] };
  sleeveLeft: { items: FlatItem[] };
  sleeveRight: { items: FlatItem[] };
}

export const VIEW_ORDER: View[] = ['front', 'back', 'sleeveLeft', 'sleeveRight'];

export const VIEW_LABELS: Record<View, string> = {
  front: 'Front',
  back: 'Back',
  sleeveLeft: 'Sleeve L',
  sleeveRight: 'Sleeve R',
};

export function emptyViews(): Views {
  return {
    front: { items: [] },
    back: { items: [] },
    sleeveLeft: { items: [] },
    sleeveRight: { items: [] },
  };
}

export function normalizeViews(v?: Views): Views {
  const base = emptyViews();
  if (!v) return base;
  for (const key of VIEW_ORDER) {
    const items = v[key]?.items ?? [];
    base[key] = { items: items.map((it) => ({ ...it, scale: it.scale ?? 1, rotationDeg: it.rotationDeg ?? 0, opacity: it.opacity ?? 1 })) };
  }
  return base;
}

export const NO_GO_BAND: Record<View, { top: number }> = {
  front: { top: 0.12 },
  back: { top: 0.12 },
  sleeveLeft: { top: 0.2 },
  sleeveRight: { top: 0.2 },
};

export const PRINTER_SIZES: Record<View, { w: number; h: number }> = {
  front: { w: 1024, h: 1024 },
  back: { w: 1024, h: 1024 },
  sleeveLeft: { w: 512, h: 512 },
  sleeveRight: { w: 512, h: 512 },
};

/** clamp item center into printable area (below no-go band) */
export function clampInto(view: View, x: number, y: number): { x: number; y: number } {
  const band = NO_GO_BAND[view].top;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(band + 0.01, y)),
  };
}

/** relative scale 1 = 0.2 view width (canvas px) */
export function itemBoxPx(canvasW: number, item: FlatItem): { w: number; h: number } {
  const base = 0.2 * canvasW;
  const s = item.scale ?? 1;
  return { w: base * s, h: base * s };
}

export const IMG_CACHE = new Map<string, HTMLImageElement | null>();
const PENDING = new Set<string>();

/** Loads an image once, invokes onLoad when it becomes available. Returns null if pending/broken. */
export function loadImage(url: string, onLoad?: () => void): HTMLImageElement | null {
  if (IMG_CACHE.has(url)) {
    const hit = IMG_CACHE.get(url);
    if (hit && hit.complete && hit.naturalWidth > 0) return hit;
    return null;
  }
  if (PENDING.has(url)) return null;
  PENDING.add(url);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    PENDING.delete(url);
    IMG_CACHE.set(url, img);
    onLoad?.();
  };
  img.onerror = () => {
    PENDING.delete(url);
    IMG_CACHE.set(url, null);
  };
  try {
    img.src = url;
  } catch {
    PENDING.delete(url);
    IMG_CACHE.set(url, null);
  }
  return null;
}

/** Draws the shirt silhouette outline guide + shaded collar no-go band. */
export function drawSilhouetteAndBand(ctx: CanvasRenderingContext2D, W: number, H: number, view: View): void {
  ctx.clearRect(0, 0, W, H);
  const band = NO_GO_BAND[view].top;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W * 0.16, H * 0.1);
  ctx.lineTo(W * 0.84, H * 0.1);
  ctx.lineTo(W * 0.86, H * 0.9);
  ctx.lineTo(W * 0.9, H * 0.98);
  ctx.lineTo(W * 0.1, H * 0.98);
  ctx.lineTo(W * 0.14, H * 0.9);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, H * band);
}

/** Clears a canvas to fully transparent. */
export function clearCanvas(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);
}

export function drawFlatItems(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  items: FlatItem[],
  onImageLoad?: () => void,
): void {
  // Callers clear the target first (silhouette guide live on the same canvas).
  for (const item of items) {
    ctx.save();
    ctx.translate(item.x * canvasW, item.y * canvasH);
    ctx.rotate(((item.rotationDeg ?? 0) * Math.PI) / 180);
    ctx.globalAlpha = item.opacity ?? 1;
    const box = itemBoxPx(canvasW, item);
    if (item.kind === 'image' && item.url) {
      const img = loadImage(item.url, onImageLoad);
      if (img && img.complete && img.naturalWidth > 0) {
        const ratio = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
        const dw = img.naturalWidth * ratio;
        const dh = img.naturalHeight * ratio;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      }
    } else if (item.kind === 'text' && item.text) {
      // `size` is authored in px at 1024; scale to the destination canvas width.
      const fontSize = (item.size ?? 60) * (canvasW / 1024);
      ctx.font = `600 ${fontSize}px ${item.font || 'Inter'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = item.color || '#ffffff';
      ctx.fillText(item.text, 0, 0);
    }
    ctx.restore();
  }
}