import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ShirtViewer, { type View, type Views, type FlatItem } from '../components/ShirtViewer';
import InstallAppBanner from '../components/InstallApp';
import FlatViewEditor from '../components/FlatViewEditor';
import { Card, ErrorBox, Field, InfoBox, PageTitle, StatusBadge, btnPrimary, btnSecondary, inputCls } from '../components/ui';
import { drawFlatItems, drawSilhouetteAndBand } from '../lib/flat';
import {
  ApiError,
  PROFILE_REQUIRED_MSG,
  SETTINGS_DEFAULTS,
  createAsset,
  createOrder,
  getOrder,
  getProfile,
  getPublicSettings,
  listMaterials,
  parseDesignSnapshot,
  parseSizesToBreakdown,
  profileComplete,
  requestQuote,
  updateOrder,
  uploadFile,
  type Material,
  type SizeBreakdown,
} from '../lib/api';
import { useSession } from '../lib/session';

const PRESETS = ['#e5e7eb', '#ffffff', '#111827', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Renders one print view to a compact JPEG dataURL for snapshot thumbs (drop if > ~38KB). */
function renderThumb(view: View, items: FlatItem[]): string | null {
  try {
    const SIZE = 400;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawSilhouetteAndBand(ctx, SIZE, SIZE, view);
    drawFlatItems(ctx, SIZE, SIZE, items);
    const url = canvas.toDataURL('image/jpeg', 0.72);
    return url.length < 38 * 1024 ? url : null;
  } catch {
    return null;
  }
}
const ACCEPT = 'image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg';
const MAX_BYTES = 10 * 1024 * 1024;
export default function DesignerPage() {
  const { token } = useSession();
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const editId = params.get('order');
  const sectionRef = useRef<HTMLElement>(null);

  const [activeView, setActiveView] = useState<View>('front');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [matError, setMatError] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [color, setColor] = useState('#e5e7eb');
  const [sizes, setSizes] = useState<SizeBreakdown>({ S: 0, M: 10, L: 0, XL: 0 });
  const [note, setNote] = useState('');
  const [views, setViews] = useState<Views>({ front: { items: [] }, back: { items: [] }, sleeveLeft: { items: [] }, sleeveRight: { items: [] } });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(editId ? Number(editId) : null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [wind, setWind] = useState(SETTINGS_DEFAULTS.fabric_wind);
  const [swingStrength, setSwingStrength] = useState(SETTINGS_DEFAULTS.swing_strength ?? 1);
  const [autorotateSpeed, setAutorotateSpeed] = useState(SETTINGS_DEFAULTS.autorotate_speed);
  const [textForm, setTextForm] = useState(false);
  const [textValue, setTextValue] = useState('Cricket Tshirts');
  const [textFont, setTextFont] = useState('Inter');
  const [textSize, setTextSize] = useState(60);
  const [textColor, setTextColor] = useState('#ffffff');
  const [selectedId, setSelectedId] = useState<string|number|null>(null);
  const itemFiles = useRef<Map<string, File>>(new Map());

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
        const sv = snap.views || {};
        setViews({
          front: { items: (sv.front?.items ?? []) as FlatItem[] },
          back: { items: (sv.back?.items ?? []) as FlatItem[] },
          sleeveLeft: { items: (sv.sleeveLeft?.items ?? []) as FlatItem[] },
          sleeveRight: { items: (sv.sleeveRight?.items ?? []) as FlatItem[] },
        });
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
    const newItems: FlatItem[] = [];
    for (const f of Array.from(files)) {
      const okType = f.type === 'image/png' || f.type === 'image/jpeg' || f.type === 'image/svg+xml';
      if (!okType) {
        setError(`Rejected ${f.name}: only png/jpeg/svg allowed.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`Rejected ${f.name}: larger than 10MB.`);
        continue;
      }
      const url = URL.createObjectURL(f);
      const fileForSave = f;
      newItems.push({
        id: `img-${Date.now()}-${Math.random()}`,
        kind: 'image',
        url,
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotationDeg: 0,
        opacity: 1,
      } as FlatItem);
      if (fileForSave) itemFiles.current.set(String(newItems[newItems.length - 1].id), fileForSave);
    }
    if (newItems.length === 0) return;
    setViews((prev) => ({ ...prev, [activeView]: { items: [...prev[activeView].items, ...newItems] } }));
  }



  /** Upload-first persist: every new local file goes through POST /api/uploads and only the
   *  returned URL (+zone/transform) is stored. Data-URLs are never embedded, except tiny
   *  (<150KB) thumbnails when the upload endpoint itself fails. */
  async function persist(requestAfter: boolean): Promise<number | null> {
    if (!token) {
      setError('Please log in first (token ts_token missing).');
      nav('/auth');
      return null;
    }
    // Profile gate FIRST (frontend only): name/phone/address/city required
    // for both Save draft and Request quote. Admin flows are unaffected
    // (designer is a customer flow).
    try {
      const profile = await getProfile();
      if (!profileComplete(profile)) {
        const back = `${location.pathname}${location.search}`;
        setError(PROFILE_REQUIRED_MSG);
        nav(`/account?next=${encodeURIComponent(back)}`);
        return null;
      }
    } catch {
      // If the profile read itself fails, surface it instead of saving blind.
      setError(`${PROFILE_REQUIRED_MSG} (could not verify profile — please check your account).`);
      const back = `${location.pathname}${location.search}`;
      nav(`/account?next=${encodeURIComponent(back)}`);
      return null;
    }
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      // Upload-first: any File-backed image item must upload via POST /api/uploads on save.
      // The caller keeps original File objects in itemFiles, keyed by item id.
      const viewsToSave: Views = {
        front: { items: [] },
        back: { items: [] },
        sleeveLeft: { items: [] },
        sleeveRight: { items: [] },
      };
      for (const vkey of ['front', 'back', 'sleeveLeft', 'sleeveRight'] as const) {
        for (const it of views[vkey].items) {
          const srcFile = itemFiles.current.get(String(it.id));
          if (srcFile) {
            try {
              const up = await uploadFile(srcFile);
              if (!up.url) throw new ApiError(0, 'Upload failed: empty URL in server response');
              viewsToSave[vkey].items.push({ ...it, url: up.url });
              itemFiles.current.delete(String(it.id));
              continue;
            } catch (e) {
              throw e instanceof ApiError ? new ApiError(e.status, e.message, e.fields) : e;
            }
          }
          viewsToSave[vkey].items.push(it);
        }
      }
      setViews(viewsToSave);
      const thumbs: Record<string, string> = {};
      for (const tv of ['front', 'back'] as const) {
        const dataUrl = renderThumb(tv, viewsToSave[tv].items);
        if (dataUrl && dataUrl.length < 38 * 1024) thumbs[tv] = dataUrl;
      }
      const snapshot: any = {
        version: 2,
        color,
        material_id: materialId,
        views: viewsToSave,
        thumbs,
      };
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
      for (const vkey of ['front', 'back', 'sleeveLeft', 'sleeveRight'] as const) {
        for (const it of viewsToSave[vkey].items) {
          if (it.kind === 'image' && it.url && !it.url.startsWith('data:') && !it.url.startsWith('blob:')) {
            try {
              const zoneMap: any = { front: 'front', back: 'back', sleeveLeft: 'sleeve_left', sleeveRight: 'sleeve_right' };
              await createAsset(id, {
                zone: zoneMap[vkey],
                file_url: it.url,
                file_type: null,
                transform: { x: it.x, y: it.y, scale: it.scale, rotationDeg: it.rotationDeg },
              });
            } catch {
              /* optional */
            }
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
      <InstallAppBanner />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div data-designer-anim className="min-w-0 lg:sticky lg:top-20">
        <Card>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Views">
            {['front','back','sleeveLeft','sleeveRight'].map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={activeView === v}
                onClick={() => setActiveView(v as View)}
                className={`min-h-[44px] shrink-0 rounded-[4px] border px-3 py-2 text-sm font-medium transition-colors ${activeView === v ? 'border-gold-deep bg-gold text-ink' : 'border-rule bg-graphite text-warm hover:border-rule-strong hover:text-champagne'}`}
              >
                {v === 'front' ? 'Front' : v === 'back' ? 'Back' : v === 'sleeveLeft' ? 'Sleeve L' : 'Sleeve R'}
                {views[v as View].items.length > 0 ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${activeView === v ? 'bg-ink/15' : 'bg-gold/15 text-gold'}`}>{views[v as View].items.length}</span> : null}
              </button>
            ))}
          </div>
          <ShirtViewer
            color={color}
            views={views}
            wind={wind}
            swingStrength={swingStrength}
            autoRotateSpeed={autorotateSpeed}
            className="h-[58vh] min-h-[380px] sm:h-[62vh] lg:h-[calc(100vh-22rem)] lg:min-h-[520px]"
          />
          <p className="mt-2 text-xs text-faint">Drag to rotate, scroll to zoom. Decals sit on the fabric via raycast anchors.</p>
        </Card>
        <div data-designer-anim className="mt-4">
          <Card>
            <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold">Flat editor — {activeView}</h2>
            <input type="file" accept={ACCEPT} multiple onChange={(e) => onFiles(e.target.files)} className="min-h-[44px] w-full rounded-[4px] border border-dashed border-rule bg-lacquer-deep px-3 py-2 text-sm text-warm file:mr-3 file:rounded-[4px] file:border-0 file:bg-graphite file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gold hover:border-rule-strong" />
            <p className="mt-2 text-xs text-faint">png / jpeg / svg, ≤10MB each. D&amp;D images land centered on the active view.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setTextForm(t => !t)} className={btnSecondary}>Add Text</button>
            </div>
            {textForm ? (
              <div className="mt-3 space-y-2 rounded-[6px] border border-rule bg-graphite p-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Text</span>
                  <input className={inputCls} value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Cricket Tshirts" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Font</span>
                    <select className={inputCls} value={textFont} onChange={(e) => setTextFont(e.target.value)}>
                      {['Inter','Fraunces','Arial','Georgia','Impact','cursive'].map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Size</span>
                    <input type="number" min={20} max={200} className={inputCls} value={textSize} onChange={(e) => setTextSize(clamp(Number(e.target.value), 20, 200))} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Color</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {['#ffffff','#f5d98c','#e5b45c'].map(c => (
                      <button key={c} type="button" onClick={() => setTextColor(c)} className={`h-9 w-9 rounded-full border ${textColor===c?'ring-2 ring-gold':'border-rule'}`} style={{backgroundColor:c}} aria-label={`Text color ${c}`}/>
                    ))}
                    <input type="color" className="h-9 w-12 cursor-pointer rounded-[4px] border border-rule" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                  </div>
                </label>
                <button type="button" className={btnPrimary} onClick={() => {
                  if (!textValue.trim()) return;
                  const newItem: FlatItem = { id: `txt-${Date.now()}-${Math.random()}`, kind: 'text', text: textValue, font: textFont, size: textSize, color: textColor, x: 0.5, y: 0.5, scale: 1, rotationDeg: 0, opacity: 1 };
                  setViews(prev => ({ ...prev, [activeView]: { items: [...prev[activeView].items, newItem] } }));
                  setSelectedId(newItem.id);
                  setTextForm(false);
                }}>Add</button>
              </div>
            ) : null}
            <FlatViewEditor
              view={activeView}
              items={views[activeView].items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={(items) => setViews(prev => ({ ...prev, [activeView]: { items } }))}
            />
          </Card>
        </div>
        </div>
        <div className="min-w-0 space-y-4">
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
