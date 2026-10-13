import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ShirtViewer, {
  ANCHOR_IDS,
  DEFAULT_ANCHOR_FOR_ZONE,
  clampDecalScale,
  type DecalAnchorId,
  type DecalZone,
  type ShirtDecal,
} from '../components/ShirtViewer';
import { Card, ErrorBox, Field, InfoBox, PageTitle, StatusBadge, btnDanger, btnPrimary, btnSecondary, inputCls } from '../components/ui';
import {
  ApiError,
  SETTINGS_DEFAULTS,
  ZONES,
  createAsset,
  createOrder,
  getOrder,
  getPublicSettings,
  listMaterials,
  parseDesignSnapshot,
  parseSizesToBreakdown,
  requestQuote,
  updateOrder,
  uploadFile,
  type Material,
  type SizeBreakdown,
} from '../lib/api';
import { useSession } from '../lib/session';

interface ZoneFile {
  key: string;
  name: string;
  preview: string;
  file: File | null;
  url?: string;
  file_type?: string;
  scale: number;
}

type AnchorMap = Record<DecalAnchorId, ZoneFile[]>;

const EMPTY_ANCHORS: AnchorMap = {
  'front-center': [],
  'front-top-left': [],
  'front-top-right': [],
  'front-bottom': [],
  'back-center': [],
  'back-top': [],
  'sleeve-left': [],
  'sleeve-right': [],
};

const ANCHOR_LABELS: Record<DecalAnchorId, string> = {
  'front-center': 'Front · center',
  'front-top-left': 'Front · top L',
  'front-top-right': 'Front · top R',
  'front-bottom': 'Front · bottom',
  'back-center': 'Back · center',
  'back-top': 'Back · top',
  'sleeve-left': 'Sleeve · L',
  'sleeve-right': 'Sleeve · R',
};

/** 8 print anchors -> the 4 backend zones (assets + legacy snapshot shape). */
const ANCHOR_TO_ZONE: Record<DecalAnchorId, DecalZone> = {
  'front-center': 'front',
  'front-top-left': 'front',
  'front-top-right': 'front',
  'front-bottom': 'front',
  'back-center': 'back',
  'back-top': 'back',
  'sleeve-left': 'sleeve_left',
  'sleeve-right': 'sleeve_right',
};

const PRESETS = ['#e5e7eb', '#ffffff', '#111827', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899'];
const ACCEPT = 'image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg';
const MAX_BYTES = 10 * 1024 * 1024;
/** Data-URL embedding is only ever allowed for tiny thumbnails below this size. */
const TINY_THUMBNAIL_BYTES = 150 * 1024;

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `zf-${Date.now()}-${keySeq}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

function emptyAnchors(): AnchorMap {
  return {
    'front-center': [],
    'front-top-left': [],
    'front-top-right': [],
    'front-bottom': [],
    'back-center': [],
    'back-top': [],
    'sleeve-left': [],
    'sleeve-right': [],
  };
}

export default function DesignerPage() {
  const { token } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('order');
  const sectionRef = useRef<HTMLElement>(null);

  const [anchor, setAnchor] = useState<DecalAnchorId>('front-center');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [matError, setMatError] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [color, setColor] = useState('#e5e7eb');
  const [sizes, setSizes] = useState<SizeBreakdown>({ S: 0, M: 10, L: 0, XL: 0 });
  const [note, setNote] = useState('');
  const [zones, setZones] = useState<AnchorMap>(EMPTY_ANCHORS);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(editId ? Number(editId) : null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [wind, setWind] = useState(SETTINGS_DEFAULTS.fabric_wind);
  const [windDefault, setWindDefault] = useState(SETTINGS_DEFAULTS.fabric_wind);
  const [swingStrength, setSwingStrength] = useState(SETTINGS_DEFAULTS.swing_strength ?? 1);
  const [autorotateSpeed, setAutorotateSpeed] = useState(SETTINGS_DEFAULTS.autorotate_speed);

  const qty = useMemo(() => sizes.S + sizes.M + sizes.L + sizes.XL, [sizes]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tween = gsap.from(el.querySelectorAll('[data-designer-anim]'), {
      y: 14,
      opacity: 0,
      duration: 0.5,
      stagger: 0.06,
      ease: 'power2.out',
      clearProps: 'all',
    });
    return () => {
      tween.kill();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    listMaterials()
      .then((m) => {
        if (alive) setMaterials(m);
      })
      .catch((e: unknown) => {
        if (alive) setMatError(e instanceof ApiError ? e.message : 'Could not load materials');
      });
    getPublicSettings()
      .then((s) => {
        if (!alive) return;
        const w = typeof s.fabric_wind === 'number' ? s.fabric_wind : SETTINGS_DEFAULTS.fabric_wind;
        setWind(w);
        setWindDefault(w);
        if (typeof s.swing_strength === 'number') setSwingStrength(s.swing_strength);
        if (typeof s.autorotate_speed === 'number') setAutorotateSpeed(s.autorotate_speed);
      })
      .catch(() => {
        /* local defaults stand */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!editId) return;
    let alive = true;
    (async () => {
      try {
        const o = await getOrder(editId);
        if (!alive) return;
        setOrderId(o.id);
        setOrderStatus(o.status ?? null);
        setMaterialId(o.material_id ?? null);
        setColor(o.color ?? '#e5e7eb');
        setSizes(parseSizesToBreakdown(o.sizes));
        setNote(o.customer_note ?? '');
        const snap = parseDesignSnapshot(o.design_snapshot);
        if (snap.color) setColor(snap.color);
        const next = emptyAnchors();
        const detailed = (snap as { decals?: Array<{ url?: string | null; name?: string | null; file_type?: string | null; zone?: DecalZone | null; anchor?: DecalAnchorId | null; scale?: number | null }> }).decals;
        if (Array.isArray(detailed) && detailed.length > 0) {
          for (const a of detailed) {
            const z = (a.zone ?? 'front') as DecalZone;
            const an: DecalAnchorId = a.anchor && ANCHOR_IDS.includes(a.anchor) ? a.anchor : (DEFAULT_ANCHOR_FOR_ZONE[z] ?? 'front-center');
            next[an].push({
              key: nextKey(),
              name: a.name ?? 'artwork',
              preview: a.url ?? '',
              file: null,
              url: a.url ?? undefined,
              file_type: a.file_type ?? undefined,
              scale: clampDecalScale(a.scale ?? undefined, 0.12),
            });
          }
        } else {
          for (const z of ZONES) {
            const arr = snap.zones?.[z] ?? [];
            const an = DEFAULT_ANCHOR_FOR_ZONE[z];
            next[an] = arr.map((a) => ({
              key: nextKey(),
              name: a.name ?? 'artwork',
              preview: a.url ?? a.preview ?? '',
              file: null,
              url: a.url ?? undefined,
              file_type: a.file_type ?? undefined,
              scale: 0.12,
            }));
          }
        }
        setZones(next);
        setInfo(`Editing order #${o.id} (${o.status ?? 'draft'}).`);
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e.message : 'Could not load order for editing');
      }
    })();
    return () => {
      alive = false;
    };
  }, [editId]);

  function onFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const list: ZoneFile[] = [];
    for (const f of Array.from(files)) {
      const okType =
        f.type === 'image/png' || f.type === 'image/jpeg' || f.type === 'image/svg+xml';
      if (!okType) {
        setError(`Rejected ${f.name}: only png/jpeg/svg allowed.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`Rejected ${f.name}: larger than 10MB.`);
        continue;
      }
      list.push({ key: nextKey(), name: f.name, preview: URL.createObjectURL(f), file: f, file_type: f.type, scale: 0.12 });
    }
    if (list.length === 0) return;
    setZones((z) => ({ ...z, [anchor]: [...z[anchor], ...list] }));
  }

  function removeAt(a: DecalAnchorId, key: string) {
    setZones((prev) => {
      const target = prev[a].find((f) => f.key === key);
      if (target && target.preview.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(target.preview);
        } catch {
          /* ignore */
        }
      }
      return { ...prev, [a]: prev[a].filter((f) => f.key !== key) };
    });
  }

  function move(a: DecalAnchorId, key: string, dir: -1 | 1) {
    setZones((prev) => {
      const arr = [...prev[a]];
      const i = arr.findIndex((f) => f.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return prev;
      const [item] = arr.splice(i, 1);
      arr.splice(j, 0, item);
      return { ...prev, [a]: arr };
    });
  }

  function setScale(a: DecalAnchorId, key: string, scale: number) {
    setZones((prev) => ({
      ...prev,
      [a]: prev[a].map((f) => (f.key === key ? { ...f, scale: clampDecalScale(scale, f.scale) } : f)),
    }));
  }

  const decals = useMemo<ShirtDecal[]>(() => {
    const out: ShirtDecal[] = [];
    for (const a of ANCHOR_IDS) {
      for (const f of zones[a]) {
        const url = f.url ?? f.preview;
        if (url) out.push({ zone: ANCHOR_TO_ZONE[a], url, anchor: a, scale: f.scale });
      }
    }
    return out;
  }, [zones]);

  const totalArtworks = useMemo(() => ANCHOR_IDS.reduce((n, a) => n + zones[a].length, 0), [zones]);

  /** Upload-first persist: every new local file goes through POST /api/uploads and only the
   *  returned URL (+zone/transform) is stored. Data-URLs are never embedded, except tiny
   *  (<150KB) thumbnails when the upload endpoint itself fails. */
  async function persist(requestAfter: boolean): Promise<number | null> {
    if (!token) {
      setError('Please log in first (token ts_token missing).');
      nav('/auth');
      return null;
    }
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const resolved: AnchorMap = emptyAnchors();
      for (const a of ANCHOR_IDS) {
        const out: ZoneFile[] = [];
        for (const f of zones[a]) {
          if (f.url && !f.url.startsWith('blob:') && !f.url.startsWith('data:')) {
            out.push(f);
            continue;
          }
          if (f.file) {
            try {
              const up = await uploadFile(f.file);
              if (!up.url) throw new ApiError(0, 'Upload failed: empty URL in server response');
              out.push({ ...f, url: up.url, file_type: up.file_type ?? f.file.type });
              continue;
            } catch (e) {
              // Tiny-thumbnail exception: embed only files <150KB; anything larger aborts
              // with the server message verbatim so the payload never triggers a 413.
              if (f.file.size < TINY_THUMBNAIL_BYTES) {
                try {
                  const dataUrl = await fileToDataUrl(f.file);
                  out.push({ ...f, url: dataUrl });
                  continue;
                } catch {
                  /* fall through to verbatim error */
                }
              }
              throw e instanceof ApiError ? new ApiError(e.status, e.message, e.fields) : e;
            }
          } else {
            out.push(f);
          }
        }
        resolved[a] = out;
      }
      setZones(resolved);
      const legacyZones = {
        front: [] as Array<{ url?: string; name: string; file_type?: string | null }>,
        back: [] as Array<{ url?: string; name: string; file_type?: string | null }>,
        sleeve_left: [] as Array<{ url?: string; name: string; file_type?: string | null }>,
        sleeve_right: [] as Array<{ url?: string; name: string; file_type?: string | null }>,
      };
      const detailed: Array<{ url?: string; name: string; file_type?: string | null; zone: DecalZone; anchor: DecalAnchorId; scale: number }> = [];
      for (const a of ANCHOR_IDS) {
        const z = ANCHOR_TO_ZONE[a];
        for (const f of resolved[a]) {
          const url = f.url ?? f.preview;
          legacyZones[z].push({ url, name: f.name, file_type: f.file_type ?? null });
          detailed.push({ url, name: f.name, file_type: f.file_type ?? null, zone: z, anchor: a, scale: f.scale });
        }
      }
      const snapshot = { color, material_id: materialId, zones: legacyZones, decals: detailed };
      const payload = {
        material_id: materialId,
        color,
        sizes,
        qty_total: qty,
        customer_note: note || null,
        design_snapshot: snapshot,
      };
      let id = orderId;
      if (id == null) {
        const created = await createOrder(payload);
        id = created.id;
        setOrderId(id);
        setOrderStatus(created.status ?? 'draft');
      } else {
        const updated = await updateOrder(id, payload);
        setOrderStatus(updated.status ?? orderStatus);
      }
      for (const a of ANCHOR_IDS) {
        for (const f of resolved[a]) {
          if (!f.file || !id) continue;
          if (!f.url || f.url.startsWith('data:') || f.url.startsWith('blob:')) continue;
          try {
            await createAsset(id, {
              zone: ANCHOR_TO_ZONE[a],
              file_url: f.url,
              file_type: f.file_type ?? null,
              transform: { anchor: a, scale: f.scale },
            });
          } catch {
            /* asset record optional — snapshot already holds the URL */
          }
        }
      }
      if (requestAfter && id != null) {
        const q = await requestQuote(id);
        setOrderStatus(q.status ?? 'quote_requested');
        setInfo(`Order #${id} moved to quote_requested.`);
      } else if (id != null) {
        setInfo(`Draft saved as order #${id}.`);
      }
      return id;
    } catch (e) {
      // Surface the server message verbatim (no prefix mangling).
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Save failed');
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section ref={sectionRef} className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageTitle
        eyebrow="Designer"
        title="Design your T-shirt"
        sub="Upload per-zone artwork, pick color, material and sizes, then save a draft or request a quote."
      />
      {orderId ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">Order #{orderId}</span>
          <StatusBadge status={orderStatus} />
          <Link to={`/orders/${orderId}`} className="font-medium text-gold hover:text-gold-pale">
            Open order →
          </Link>
        </div>
      ) : null}
      <ErrorBox message={error} onDismiss={() => setError(null)} />
      <InfoBox message={info} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div data-designer-anim className="min-w-0 lg:sticky lg:top-20">
        <Card>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Print zones">
            {ANCHOR_IDS.map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={anchor === a}
                onClick={() => setAnchor(a)}
                className={`min-h-[44px] shrink-0 rounded-[4px] border px-3 py-2 text-sm font-medium transition-colors ${anchor === a ? 'border-gold-deep bg-gold text-ink' : 'border-rule bg-graphite text-warm hover:border-rule-strong hover:text-champagne'}`}
              >
                {ANCHOR_LABELS[a]}
                {zones[a].length > 0 ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${anchor === a ? 'bg-ink/15' : 'bg-gold/15 text-gold'}`}>{zones[a].length}</span> : null}
              </button>
            ))}
          </div>
          <ShirtViewer
            color={color}
            decals={decals}
            wind={wind}
            swingStrength={swingStrength}
            autoRotateSpeed={autorotateSpeed}
            className="h-[58vh] min-h-[380px] sm:h-[62vh] lg:h-[calc(100vh-22rem)] lg:min-h-[520px]"
          />
          <p className="mt-2 text-xs text-faint">Drag to rotate, scroll to zoom. Decals sit on the fabric via raycast anchors.</p>
          <label className="mt-3 block">
            <span className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              <span>Fabric wind · session override</span>
              <span className="font-mono normal-case tracking-normal">{wind.toFixed(2)} (admin default {windDefault.toFixed(2)})</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={wind}
              onChange={(e) => setWind(Number(e.target.value))}
              className="h-[44px] w-full cursor-pointer"
              aria-label="Fabric wind"
            />
          </label>
        </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <div data-designer-anim>
          <Card>
            <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold">Artwork — {ANCHOR_LABELS[anchor]}</h2>
            <input type="file" accept={ACCEPT} multiple onChange={(e) => onFiles(e.target.files)} className="min-h-[44px] w-full rounded-[4px] border border-dashed border-rule bg-lacquer-deep px-3 py-2 text-sm text-warm file:mr-3 file:rounded-[4px] file:border-0 file:bg-graphite file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gold hover:border-rule-strong" />
            <p className="mt-2 text-xs text-faint">png / jpeg / svg, ≤10MB each. Each decal gets its own size. Reorder with ↑ ↓.</p>
            <ul className="mt-3 space-y-2">
              {zones[anchor].length === 0 ? <li className="rounded-[6px] border border-dashed border-rule px-3 py-8 text-center text-sm text-faint">No artwork in this zone yet — upload a file to see it on the shirt.</li> : null}
              {zones[anchor].map((f) => (
                <li key={f.key} className="rounded-[6px] border border-rule bg-lacquer-deep p-2.5">
                  <div className="flex items-center gap-2">
                    {f.preview || f.url ? (
                      <img src={f.url ?? f.preview} alt={f.name} className="h-12 w-12 shrink-0 rounded-[4px] border border-rule bg-graphite object-contain" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-[4px] border border-rule bg-graphite" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-champagne">{f.name}</div>
                      <div className="text-xs text-muted">{f.url && !f.url.startsWith('data:') && !f.url.startsWith('blob:') ? 'uploaded' : f.file ? 'local — uploads on save' : 'linked'}</div>
                    </div>
                    <button type="button" className={btnSecondary} onClick={() => move(anchor, f.key, -1)} aria-label={`Move ${f.name} up`}>↑</button>
                    <button type="button" className={btnSecondary} onClick={() => move(anchor, f.key, 1)} aria-label={`Move ${f.name} down`}>↓</button>
                    <button type="button" className={btnDanger} onClick={() => removeAt(anchor, f.key)} aria-label={`Remove ${f.name}`}>
                      Remove
                    </button>
                  </div>
                  <label className="mt-2 block">
                    <span className="mb-0.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      <span>Size on shirt</span>
                      <span className="font-mono normal-case tracking-normal">{f.scale.toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min={0.04}
                      max={0.25}
                      step={0.01}
                      value={f.scale}
                      onChange={(e) => setScale(anchor, f.key, Number(e.target.value))}
                      className="h-[36px] w-full cursor-pointer"
                      aria-label={`Size for ${f.name}`}
                    />
                  </label>
                </li>
              ))}
            </ul>
            {totalArtworks === 0 ? (
              <p className="mt-2 text-xs text-faint">Tip: start with Front · center — it maps to the classic chest print.</p>
            ) : null}
          </Card>
          </div>
          <div data-designer-anim>
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Garment color">
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-14 cursor-pointer rounded-[4px] border border-rule" aria-label="Garment color picker" />
                  <input className={inputCls} value={color} onChange={(e) => setColor(e.target.value)} placeholder="#e5e7eb" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`h-9 w-9 rounded-full border border-rule transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-gold ring-offset-2 ring-offset-raised' : ''}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Pick ${c}`}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Material">
                <select
                  className={inputCls}
                  value={materialId ?? ''}
                  onChange={(e) => setMaterialId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— choose —</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? `Material #${m.id}`}{m.base_price != null ? ` — ₹${m.base_price}` : ''}
                    </option>
                  ))}
                </select>
                {matError ? <span className="mt-1 block text-xs text-vermilion">{matError} (GET /api/materials)</span> : null}
              </Field>
            </div>
            <div className="mt-3">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Size breakdown — total {qty}
              </span>
              <div className="grid grid-cols-4 gap-2">
                {(['S', 'M', 'L', 'XL'] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-center text-xs font-bold text-warm">{k}</span>
                    <input
                      type="number"
                      min={0}
                      className={inputCls}
                      value={sizes[k]}
                      onChange={(e) => setSizes((s) => ({ ...s, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <Field label="Customer note">
                <textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Print instructions, placement notes…" />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void persist(false)} className={btnSecondary}>
                {busy ? 'Saving…' : 'Save Draft'}
              </button>
              <button type="button" disabled={busy} onClick={() => void persist(true)} className={btnPrimary}>
                {busy ? 'Saving…' : 'Save + Request Quote'}
              </button>
            </div>
          </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
