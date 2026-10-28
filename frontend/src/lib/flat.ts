export type View = 'front' | 'back' | 'sleeveLeft' | 'sleeveRight' | 'hoodie' | 'cap';

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
  hoodie?: { items: FlatItem[] };
  cap?: { items: FlatItem[] };
}

export const VIEW_ORDER: View[] = ['front', 'back', 'sleeveLeft', 'sleeveRight'];

export const VIEW_LABELS: Record<View, string> = {
  front: 'Front',
  back: 'Back',
  sleeveLeft: 'Sleeve L',
  sleeveRight: 'Sleeve R',
  hoodie: 'Hoodie',
  cap: 'Cap',
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
  hoodie: { top: 0.2 },
  cap: { top: 0.2 },
};

export const PRINTER_SIZES: Record<View, { w: number; h: number }> = {
  front: { w: 1024, h: 1024 },
  back: { w: 1024, h: 1024 },
  sleeveLeft: { w: 512, h: 512 },
  sleeveRight: { w: 512, h: 512 },
  hoodie: { w: 1024, h: 1024 },
  cap: { w: 512, h: 512 },
};

/** clamp item center into printable area (below no-go band; sleeves: whole panel) */
export function clampInto(view: View, x: number, y: number): { x: number; y: number } {
  const b = printableBounds(view);
  return {
    x: Math.min(b.x1, Math.max(b.x0, x)),
    y: Math.min(b.y1, Math.max(b.y0, y)),
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

/** printable area bounds (0..1) for alignment targets.
 *  front/back: torso region below the collar band. sleeves: whole panel. */
export function printableBounds(view: View): { x0: number; x1: number; y0: number; y1: number } {
  if (view === 'sleeveLeft' || view === 'sleeveRight') {
    return { x0: 0.02, x1: 0.98, y0: 0.02, y1: 0.98 };
  }
  const band = NO_GO_BAND[view].top + 0.01;
  return { x0: 0.06, x1: 0.94, y0: band, y1: 0.96 };
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

/** Draws the garment panel guide (screen only — never called by the 3D print
 *  bake, which uses clearCanvas + drawFlatItems art-only).
 *  front/back: tee flat-sketch (torso, collar band, shoulder slopes, dimmed
 *  decorative sleeve caps, hem) + dashed gold printable torso boundary.
 *  sleeves: single tapered sleeve panel (wide shoulder/top → narrow cuff/bottom)
 *  + dashed logo-zone marker top-center + vertical center strip guide. */
export function drawSilhouetteAndBand(ctx: CanvasRenderingContext2D, W: number, H: number, view: View): void {
  ctx.clearRect(0, 0, W, H);
  // kinpaku ground
  ctx.fillStyle = '#16161a';
  ctx.fillRect(0, 0, W, H);

  if (view === 'sleeveLeft' || view === 'sleeveRight') {
    drawSleevePanel(ctx, W, H);
    return;
  }
  drawTeePanel(ctx, W, H);
}

function drawTeePanel(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const b = printableBounds('front');
  // key geometry (0..1 space)
  const neckCX = 0.5;
  const neckW = 0.16; // half-width of collar opening
  const shoulderY = 0.10;
  const shoulderX0 = 0.30;
  const shoulderX1 = 0.70;
  const sleeveOuterX = 0.06;
  const sleeveInnerX0 = 0.30;
  const sleeveInnerX1 = 0.70;
  const sleeveOuterX1 = 0.94;
  const bodyX0 = 0.30;
  const bodyX1 = 0.70;
  const hemY = 0.96;
  const armY = 0.30;

  const X = (v: number) => v * W;
  const Y = (v: number) => v * H;

  // --- decorative sleeve caps (non-printable, dimmed) ---
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = Math.max(2, W * 0.003);
  // left cap
  ctx.beginPath();
  ctx.moveTo(X(shoulderX0), Y(shoulderY));
  ctx.lineTo(X(sleeveOuterX), Y(armY - 0.06));
  ctx.lineTo(X(0.10), Y(armY + 0.06));
  ctx.lineTo(X(sleeveInnerX0), Y(armY));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // right cap
  ctx.beginPath();
  ctx.moveTo(X(shoulderX1), Y(shoulderY));
  ctx.lineTo(X(sleeveOuterX1), Y(armY - 0.06));
  ctx.lineTo(X(0.90), Y(armY + 0.06));
  ctx.lineTo(X(sleeveInnerX1), Y(armY));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // "decorative" tag
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = `${Math.round(W * 0.022)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('sleeve · decorative', X(0.135), Y(armY + 0.10));
  ctx.fillText('sleeve · decorative', X(0.865), Y(armY + 0.10));
  ctx.restore();

  // --- torso body ---
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = Math.max(2, W * 0.0035);
  ctx.beginPath();
  // start at left collar edge, slope to shoulder, down body to hem
  ctx.moveTo(X(neckCX - neckW), Y(shoulderY));
  ctx.lineTo(X(shoulderX0), Y(shoulderY)); // left shoulder slope (slight)
  ctx.lineTo(X(bodyX0), Y(armY)); // armpit
  ctx.lineTo(X(bodyX0 - 0.015), Y(hemY)); // left side seam (slight taper out)
  ctx.lineTo(X(bodyX1 + 0.015), Y(hemY)); // hem
  ctx.lineTo(X(bodyX1), Y(armY)); // right armpit
  ctx.lineTo(X(shoulderX1), Y(shoulderY)); // right shoulder
  ctx.lineTo(X(neckCX + neckW), Y(shoulderY)); // right collar edge
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // hem line
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = Math.max(1.5, W * 0.002);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(X(bodyX0 - 0.012), Y(hemY - 0.025));
  ctx.lineTo(X(bodyX1 + 0.012), Y(hemY - 0.025));
  ctx.stroke();
  ctx.restore();

  // --- crew neckline rib: collar band stays top 12% ---
  const band = NO_GO_BAND.front.top;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, W, H * band);
  // collar rib: two arcs forming the band
  ctx.strokeStyle = 'rgba(240,180,90,0.55)';
  ctx.lineWidth = Math.max(2, W * 0.004);
  ctx.beginPath();
  ctx.ellipse(X(neckCX), Y(shoulderY - 0.005), X(neckW), Y(0.035), 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1.5, W * 0.0025);
  ctx.beginPath();
  ctx.ellipse(X(neckCX), Y(shoulderY - 0.012), X(neckW + 0.018), Y(0.048), 0, 0, Math.PI);
  ctx.stroke();
  // no-go label
  ctx.fillStyle = 'rgba(240,180,90,0.75)';
  ctx.font = `600 ${Math.round(W * 0.022)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('collar · no print', X(0.5), Y(band - 0.025));
  ctx.restore();

  // --- printable torso region: dashed gold boundary ---
  ctx.save();
  ctx.strokeStyle = '#e5b45c';
  ctx.lineWidth = Math.max(2, W * 0.003);
  ctx.setLineDash([W * 0.014, W * 0.010]);
  ctx.globalAlpha = 0.85;
  ctx.strokeRect(X(b.x0), Y(b.y0), X(b.x1 - b.x0), Y(b.y1 - b.y0));
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(229,180,92,0.8)';
  ctx.font = `600 ${Math.round(W * 0.02)}px Inter, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('printable', X(b.x0) + 6, Y(b.y0) + Math.round(W * 0.028));
  ctx.restore();
}

function drawSleevePanel(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  // Tapered sleeve panel: wide at shoulder/top, narrow cuff/bottom, slight curve.
  const topY = 0.06;
  const botY = 0.94;
  const topHalf = 0.30; // half-width at shoulder
  const botHalf = 0.185; // half-width at cuff
  const cx = 0.5;
  const X = (v: number) => v * W;
  const Y = (v: number) => v * H;

  // panel fill + outline
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = Math.max(2, W * 0.0035);
  ctx.beginPath();
  ctx.moveTo(X(cx - topHalf), Y(topY));
  // left edge: gentle inward curve to cuff
  ctx.quadraticCurveTo(X(cx - topHalf + 0.035), Y((topY + botY) / 2), X(cx - botHalf), Y(botY));
  ctx.lineTo(X(cx + botHalf), Y(botY));
  // right edge mirror
  ctx.quadraticCurveTo(X(cx + topHalf - 0.035), Y((topY + botY) / 2), X(cx + topHalf), Y(topY));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // shoulder seam + cuff rib
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = Math.max(1.5, W * 0.002);
  ctx.beginPath();
  ctx.moveTo(X(cx - topHalf), Y(topY + 0.015));
  ctx.lineTo(X(cx + topHalf), Y(topY + 0.015));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(X(cx - botHalf), Y(botY - 0.03));
  ctx.lineTo(X(cx + botHalf), Y(botY - 0.03));
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.font = `${Math.round(W * 0.022)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('shoulder', X(cx), Y(topY - 0.018));
  ctx.fillText('cuff', X(cx), Y(botY + 0.045));
  ctx.restore();

  // R-065: subtle print-zone band highlighting sweet spot y 0.50-0.75.
  ctx.save();
  const bandY0 = 0.50;
  const bandY1 = 0.75;
  ctx.fillStyle = 'rgba(229,180,92,0.08)';
  ctx.fillRect(X(0.18), Y(bandY0), X(0.64), Y(bandY1) - Y(bandY0));
  ctx.strokeStyle = 'rgba(229,180,92,0.45)';
  ctx.lineWidth = Math.max(1, W * 0.002);
  ctx.setLineDash([W * 0.008, W * 0.006]);
  ctx.strokeRect(X(0.18), Y(bandY0), X(0.64), Y(bandY1) - Y(bandY0));
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(229,180,92,0.85)';
  ctx.font = `600 ${Math.round(W * 0.018)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('logo zone · 1-2 in above hem', X(cx), Y(bandY0 + 0.025));
  ctx.restore();



  // vertical center strip guide: dashed center line top→bottom
  ctx.save();
  ctx.strokeStyle = 'rgba(229,180,92,0.55)';
  ctx.lineWidth = Math.max(1.5, W * 0.002);
  ctx.setLineDash([W * 0.010, W * 0.010]);
  ctx.beginPath();
  ctx.moveTo(X(cx), Y(topY));
  ctx.lineTo(X(cx), Y(botY));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
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
      // Line-height fixed 1.15; multiline supported (split on \n).
      const fontSize = (item.size ?? 60) * (canvasW / 1024);
      const scaleFactor = (item.scale ?? 1);
      const px = fontSize * scaleFactor;
      ctx.font = `600 ${px}px ${item.font || 'Inter'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = item.color || '#ffffff';
      const lines = String(item.text).split('\n');
      const lh = px * 1.15;
      const y0 = -((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) => ctx.fillText(ln, 0, y0 + i * lh));
    }
    ctx.restore();
  }
}