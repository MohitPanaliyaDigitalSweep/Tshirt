import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ShirtViewer, { type DecalZone } from '../components/ShirtViewer';
import { Card, ErrorBox, Field, InfoBox, PageTitle, StatusBadge, btnDanger, btnPrimary, btnSecondary, inputCls } from '../components/ui';
import {
  ApiError,
  ORDER_STATUSES,
  ZONES,
  createAsset,
  deleteAsset,
  getOrder,
  listAssets,
  listMaterials,
  parseDesignSnapshot,
  parseSizesToBreakdown,
  quoteOrder,
  updateAsset,
  updateOrder,
  uploadFile,
  type Asset,
  type DesignSnapshot,
  type Material,
  type Order,
  type SizeBreakdown,
  type Zone,
  type ZoneArtworkRef,
} from '../lib/api';

export default function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [materialId, setMaterialId] = useState<number | null>(null);
  const [color, setColor] = useState('');
  const [sizes, setSizes] = useState<SizeBreakdown>({ S: 0, M: 0, L: 0, XL: 0 });
  const [qty, setQty] = useState(0);
  const [qtyAuto, setQtyAuto] = useState(true);
  const [customerNote, setCustomerNote] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [status, setStatus] = useState('draft');
  const [quotePrice, setQuotePrice] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const [snap, setSnap] = useState<DesignSnapshot>({ zones: {} });
  const [activeZone, setActiveZone] = useState<DecalZone>('front');

  const autoQty = useMemo(() => sizes.S + sizes.M + sizes.L + sizes.XL, [sizes]);
  useEffect(() => {
    if (qtyAuto) setQty(autoQty);
  }, [autoQty, qtyAuto]);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const o = await getOrder(id);
      setOrder(o);
      setMaterialId(o.material_id ?? null);
      setColor(o.color ?? '');
      const b = parseSizesToBreakdown(o.sizes);
      setSizes(b);
      setQty(o.qty_total ?? b.S + b.M + b.L + b.XL);
      setQtyAuto(o.qty_total == null || o.qty_total === b.S + b.M + b.L + b.XL);
      setCustomerNote(o.customer_note ?? '');
      setAdminNote(o.admin_note ?? '');
      setStatus(o.status ?? 'draft');
      setQuotePrice(o.quote_price != null ? String(o.quote_price) : '');
      setQuoteNote(o.admin_note ?? '');
      setSnap(parseDesignSnapshot(o.design_snapshot));
      try {
        setAssets(await listAssets(o.id));
      } catch {
        setAssets([]);
      }
      try {
        setMaterials(await listMaterials());
      } catch {
        setMaterials([]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? `GET /api/orders/${id} failed (${e.status}): ${e.message}` : 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function persistSnapshot(next: DesignSnapshot): Promise<void> {
    if (!order) return;
    setSnap(next);
    const updated = await updateOrder(order.id, { design_snapshot: next });
    setOrder(updated);
  }

  async function onSaveAll() {
    if (!order) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await updateOrder(order.id, {
        material_id: materialId,
        color: color || null,
        sizes,
        qty_total: qtyAuto ? autoQty : qty,
        status,
        customer_note: customerNote || null,
        admin_note: adminNote || null,
        quote_price: quotePrice.trim() === '' ? null : Number(quotePrice),
        design_snapshot: snap,
      });
      setOrder(updated);
      setInfo('Order saved (PUT /api/orders/:id).');
    } catch (e) {
      setError(e instanceof ApiError ? `Save failed (${e.status}): ${e.message}` : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function onQuote() {
    if (!order) return;
    const price = Number(quotePrice);
    if (!Number.isFinite(price) || price < 0) {
      setError('Quote price must be a non-negative number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const q = await quoteOrder(order.id, Math.floor(price), quoteNote || null);
      setOrder(q);
      setStatus(q.status ?? 'quoted');
      setInfo(`Quoted at ₹${price} (PATCH /api/admin/orders/:id/quote).`);
    } catch (e) {
      setError(e instanceof ApiError ? `Quote failed (${e.status}): ${e.message}` : 'Quote failed');
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(s: string) {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      // No POST .../status route on the backend — admin status changes go through PUT.
      const updated = await updateOrder(order.id, { status: s });
      setOrder(updated);
      setStatus(updated.status ?? s);
      setInfo(`Status → ${updated.status ?? s}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Status change failed');
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveArtwork(zone: Zone, idx: number) {
    if (!order) return;
    const arr = [...(snap.zones?.[zone] ?? [])];
    arr.splice(idx, 1);
    const next: DesignSnapshot = { ...snap, zones: { ...snap.zones, [zone]: arr } };
    setError(null);
    try {
      await persistSnapshot(next);
      setInfo(`Removed artwork from ${zone}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Remove failed');
    }
  }

  async function onReplaceArtwork(zone: Zone, idx: number, file: File | undefined) {
    if (!order || !file) return;
    setError(null);
    try {
      const up = await uploadFile(file);
      const arr = [...(snap.zones?.[zone] ?? [])];
      const prev: ZoneArtworkRef = arr[idx] ?? {};
      arr[idx] = { ...prev, url: up.url, name: file.name, file_type: up.file_type ?? file.type };
      await persistSnapshot({ ...snap, zones: { ...snap.zones, [zone]: arr } });
      setInfo(`Replaced artwork in ${zone}.`);
      await refreshAssets();
    } catch (e) {
      setError(e instanceof ApiError ? `Replace failed (${e.status}): ${e.message}` : 'Replace failed');
    }
  }

  async function onAddArtwork(zone: Zone, file: File | undefined) {
    if (!order || !file) return;
    setError(null);
    try {
      const up = await uploadFile(file);
      const arr = [...(snap.zones?.[zone] ?? []), { url: up.url, name: file.name, file_type: up.file_type ?? file.type }];
      await persistSnapshot({ ...snap, zones: { ...snap.zones, [zone]: arr } });
      try {
        await createAsset(order.id, { zone, file_url: up.url, file_type: up.file_type ?? file.type });
      } catch {
        /* optional */
      }
      await refreshAssets();
      setInfo(`Added artwork to ${zone}.`);
    } catch (e) {
      setError(e instanceof ApiError ? `Add failed (${e.status}): ${e.message}` : 'Add failed');
    }
  }

  async function refreshAssets() {
    if (!order) return;
    try {
      setAssets(await listAssets(order.id));
    } catch {
      /* keep old */
    }
  }

  async function onDeleteAsset(a: Asset) {
    if (!window.confirm(`Delete asset #${a.id}?`)) return;
    setError(null);
    try {
      await deleteAsset(a.id);
      await refreshAssets();
      setInfo(`Asset #${a.id} deleted.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  }

  async function onAssetZone(a: Asset, zone: string) {
    setError(null);
    try {
      await updateAsset(a.id, { zone });
      await refreshAssets();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Asset update failed');
    }
  }

  if (loading) return <section className="mx-auto max-w-6xl p-6"><p className="text-sm text-muted">Loading…</p></section>;
  if (!order) return <section className="mx-auto max-w-6xl p-6"><ErrorBox message={error ?? 'Not found'} /></section>;

  const artworks: Partial<Record<DecalZone, string[]>> = {};
  for (const z of ZONES) artworks[z] = (snap.zones?.[z] ?? []).map((a) => a.url ?? a.preview ?? '').filter(Boolean);

  return (
    <section className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageTitle eyebrow="Admin" title={`Order #${order.id}`} sub="Every field editable. Mutations refetch + inline errors." />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={order.status} />
        <Link to="/admin" className="font-medium text-gold hover:text-gold-pale">← Dashboard</Link>
      </div>
      <ErrorBox message={error} onDismiss={() => setError(null)} />
      <InfoBox message={info} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Client (readonly)</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-muted">Customer ID</dt><dd>{order.customer_id ?? '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Name</dt><dd>{order.customer_name ?? '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Email</dt><dd className="break-all">{order.customer_email ?? '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Created</dt><dd className="text-xs">{order.created_at ?? '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Updated</dt><dd className="text-xs">{order.updated_at ?? '—'}</dd></div>
          </dl>
          <h2 className="mb-2 mt-4 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">3D preview</h2>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {ZONES.map((z) => (
              <button key={z} type="button" onClick={() => setActiveZone(z)} className={`min-h-[36px] rounded-[4px] border px-2 py-1 text-xs font-medium ${activeZone === z ? 'border-gold-deep bg-gold text-ink' : 'border-rule bg-graphite text-warm hover:border-rule-strong'}`}>
                {z}
              </button>
            ))}
          </div>
          <div className="h-64 overflow-hidden rounded-[4px] border border-rule">
            <ShirtViewer zone={activeZone} color={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#e5e7eb'} artworks={artworks} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Garment + sizes</h2>
          <div className="space-y-3">
            <Field label="Material">
              <select className={inputCls} value={materialId ?? ''} onChange={(e) => setMaterialId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— none —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.name ?? `Material #${m.id}`}</option>
                ))}
              </select>
            </Field>
            <Field label="Color">
              <div className="flex items-center gap-2">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#e5e7eb'} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded-[4px] border border-rule" />
                <input className={inputCls} value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </Field>
            <div>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Sizes</span>
              <div className="grid grid-cols-4 gap-2">
                {(['S', 'M', 'L', 'XL'] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-center text-xs font-bold text-muted">{k}</span>
                    <input type="number" min={0} className={inputCls} value={sizes[k]} onChange={(e) => setSizes((s) => ({ ...s, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
                  </label>
                ))}
              </div>
            </div>
            <Field label={`Qty total ${qtyAuto ? `(auto ${autoQty})` : ''}`}>
              <div className="flex items-center gap-2">
                <input type="number" min={0} className={inputCls} value={qtyAuto ? autoQty : qty} onChange={(e) => { setQtyAuto(false); setQty(Math.max(0, Math.floor(Number(e.target.value) || 0))); }} />
                <button type="button" onClick={() => setQtyAuto(true)} className={btnSecondary}>Auto</button>
              </div>
            </Field>
            <Field label="Customer note">
              <textarea className={inputCls} rows={2} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
            </Field>
            <Field label="Admin note">
              <textarea className={inputCls} rows={2} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            </Field>
            <Field label="Status">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <button type="button" disabled={busy} onClick={() => void onSaveAll()} className={btnPrimary}>Save all (PUT)</button>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void onStatus('done')} className={btnSecondary}>Mark done</button>
              <button type="button" disabled={busy} onClick={() => void onStatus('cancelled')} className={btnSecondary}>Cancel</button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Quote form → quoted</h2>
          <div className="space-y-3">
            <Field label="Quote price (₹)">
              <input className={inputCls} inputMode="numeric" value={quotePrice} onChange={(e) => setQuotePrice(e.target.value)} placeholder="e.g. 1299" />
            </Field>
            <Field label="Quote / admin note">
              <textarea className={inputCls} rows={3} value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} />
            </Field>
            <button type="button" disabled={busy} onClick={() => void onQuote()} className={btnPrimary}>Send quote (PATCH /quote)</button>
            <p className="text-xs text-muted">Current: {order.quote_price != null ? `₹${order.quote_price}` : '—'} · {order.status}</p>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Design snapshot — zones (thumbnails + download + replace/remove)</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {ZONES.map((z) => (
            <div key={z} className="rounded-[4px] border border-rule p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold text-muted">{z} ({(snap.zones?.[z] ?? []).length})</span>
                <label className="cursor-pointer text-xs font-semibold font-medium text-gold hover:text-gold-pale">
                  + add
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      void onAddArtwork(z, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <div className="space-y-2">
                {(snap.zones?.[z] ?? []).map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-[4px] border border-rule p-1.5">
                    {a.url ? <img src={a.url} alt={a.name ?? `${z}-${i}`} className="h-12 w-12 rounded-[4px] border border-rule object-contain bg-lacquer-deep" /> : <div className="h-12 w-12 rounded bg-graphite" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{a.name ?? `art-${i}`}</div>
                      <div className="flex gap-2 text-xs">
                        {a.url && !a.url.startsWith('blob:') ? <a href={a.url} download target="_blank" rel="noreferrer" className="font-medium text-gold hover:text-gold-pale">download</a> : null}
                        <label className="cursor-pointer font-medium text-gold hover:text-gold-pale">
                          replace
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml"
                            className="hidden"
                            onChange={(e) => {
                              void onReplaceArtwork(z, i, e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <button type="button" onClick={() => void onRemoveArtwork(z, i)} className="rounded-[4px] border border-vermilion/60 px-2 py-1 text-xs font-semibold text-vermilion hover:bg-vermilion/15">
                      Remove
                    </button>
                  </div>
                ))}
                {(snap.zones?.[z] ?? []).length === 0 ? <p className="text-xs text-faint">No artwork.</p> : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Assets for order #{order.id} (GET /orders/:id/assets)</h2>
          <button type="button" onClick={() => void refreshAssets()} className={btnSecondary}>Refetch</button>
        </div>
        {assets.length === 0 ? (
          <p className="text-sm text-muted">No asset rows. Snapshot URLs above are the source of truth until uploads land.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {assets.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-[4px] border border-rule p-2">
                {a.file_url ? <img src={a.file_url} alt={`asset-${a.id}`} className="h-14 w-14 rounded-[4px] border border-rule object-contain bg-lacquer-deep" /> : null}
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-bold">#{a.id} · {a.file_type ?? 'file'}</div>
                  <select className={`${inputCls} mt-1`} value={a.zone ?? ''} onChange={(e) => void onAssetZone(a, e.target.value)}>
                    <option value="">— zone —</option>
                    {ZONES.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                  {a.file_url ? <a href={a.file_url} download target="_blank" rel="noreferrer" className="mt-1 inline-block font-medium text-gold hover:text-gold-pale">download / open</a> : null}
                </div>
                <button type="button" onClick={() => void onDeleteAsset(a)} className={btnDanger}>Del</button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
