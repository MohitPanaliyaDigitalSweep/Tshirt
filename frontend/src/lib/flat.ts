export type View = 'front' | 'back' | 'sleeveLeft' | 'sleeveRight';

export interface CropRect {
  /** 0..1 fractions of the source image: left, top, width, height */
  cx: number;
  cy: number;
  cw: number;
  ch: number;
}

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
  /** visibility + edit-lock flags for the layer list */
  visible?: boolean;
  locked?: boolean;
  /** aspect-lock for image resize */
  lockAspect?: boolean;
  /** explicit pixel size (canvas px at 1024); falls back to itemBoxPx when unset */
  w?: number;
  h?: number;
  /** crop rect for image items (0..1 source fractions) */
  crop?: CropRect | null;
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
    base[key] = {
      items: items.map((it) => ({
        ...it,
        scale: it.scale ?? 1,
        rotationDeg: it.rotationDeg ?? 0,
        opacity: it.opacity ?? 1,
        visible: it.visible ?? true,
        locked: it.locked ?? false,
        lockAspect: it.lockAspect ?? true,
        crop: it.crop ?? null,
      })),
    };
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

/** relative scale 1 = 0.2 view width (canvas px); explicit w/h win when set */
export function itemBoxPx(canvasW: number, item: FlatItem): { w: number; h: number } {
  const k = canvasW / 1024;
  if (item.w != null && item.h != null) return { w: item.w * k, h: item.h * k };
  const base = 0.2 * canvasW;
  const s = item.scale ?? 1;
  if (item.w != null) return { w: item.w * k, h: base * s };
  if (item.h != null) return { w: base * s, h: item.h * k };
  return { w: base * s, h: base * s };
}

/** printable area bounds (0..1) for alignment targets */
export function printableBounds(view: View): { x0: number; x1: number; y0: number; y1: number } {
  const band = NO_GO_BAND[view].top + 0.01;
  return { x0: 0.02, x1: 0.98, y0: band, y1: 0.98 };
}

export type AlignKind = 'left' | 'centerH' | 'right' | 'top' | 'middleV' | 'bottom' | 'center';

export function alignItem(view: View, item: FlatItem, kind: AlignKind): { x: number; y: number } {
  const b = printableBounds(view);
  let { x, y } = item;
  if (kind === 'left') x = b.x0;
  else if (kind === 'centerH' || kind === 'center') x = (b.x0 + b.x1) / 2;
  else if (kind === 'right') x = b.x1;
  if (kind === 'top') y = b.y0;
  else if (kind === 'middleV' || kind === 'center') y = (b.y0 + b.y1) / 2;
  else if (kind === 'bottom') y = b.y1;
  return clampInto(view, x, y);
}

/** snap threshold in px (at 1024 canvas): center H/V guides */
export const SNAP_PX = 6;

export function snapCenter(
  view: View,
  x: number,
  y: number,
  canvasW = 1024,
): { x: number; y: number; snapH: boolean; snapV: boolean } {
  const b = printableBounds(view);
  const cx = ((b.x0 + b.x1) / 2) * canvasW;
  const cy = ((b.y0 + b.y1) / 2) * canvasW;
  const px = x * canvasW;
  const py = y * canvasW;
  let nx = x;
  let ny = y;
  let snapV = false;
  let snapH = false;
  if (Math.abs(px - cx) <= SNAP_PX) {
    nx = cx / canvasW;
    snapV = true;
  }
  if (Math.abs(py - cy) <= SNAP_PX) {
    ny = cy / canvasW;
    snapH = true;
  }
  return { x: nx, y: ny, snapH, snapV };
}

export function clampCrop(c: CropRect): CropRect {
  const cx = Math.min(1, Math.max(0, c.cx));
  const cy = Math.min(1, Math.max(0, c.cy));
  const cw = Math.min(1 - cx, Math.max(0.05, c.cw));
  const ch = Math.min(1 - cy, Math.max(0.05, c.ch));
  return { cx, cy, cw, ch };
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
    if (item.visible === false) continue;
    ctx.save();
    ctx.translate(item.x * canvasW, item.y * canvasH);
    ctx.rotate(((item.rotationDeg ?? 0) * Math.PI) / 180);
    ctx.globalAlpha = item.opacity ?? 1;
    const box = itemBoxPx(canvasW, item);
    if (item.kind === 'image' && item.url) {
      const img = loadImage(item.url, onImageLoad);
      if (img && img.complete && img.naturalWidth > 0) {
        const crop = item.crop;
        const sx = crop ? crop.cx * img.naturalWidth : 0;
        const sy = crop ? crop.cy * img.naturalHeight : 0;
        const sw = crop ? crop.cw * img.naturalWidth : img.naturalWidth;
        const sh = crop ? crop.ch * img.naturalHeight : img.naturalHeight;
        const srcRatio = sw / Math.max(1, sh);
        let dw = box.w;
        let dh = box.w / srcRatio;
        if (dh > box.h) {
          dh = box.h;
          dw = box.h * srcRatio;
        }
        ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
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