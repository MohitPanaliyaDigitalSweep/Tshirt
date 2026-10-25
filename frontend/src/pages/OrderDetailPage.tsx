import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, ErrorBox, Field, InfoBox, PageTitle, StatusBadge, btnDanger, btnPrimary, btnSecondary, inputCls } from '../components/ui';
import FlatViewEditor from '../components/FlatViewEditor';
import ShirtViewer from '../components/ShirtViewer';
import type { View, Views, FlatItem } from '../components/ShirtViewer';
import {
  ApiError,
  ORDER_STATUSES,
  PROFILE_REQUIRED_MSG,
  cancelOrder,
  confirmOrder,
  deleteOrder,
  getOrder,
  getProfile,
  listAssets,
  listMaterials,
  parseDesignSnapshot,
  parseSizesToBreakdown,
  profileComplete,
  requestQuote,
  updateOrder,
  type Asset,
  type Material,
  type Order,
  type SizeBreakdown,
} from '../lib/api';

function editable(status: string | null | undefined): boolean {
  return status == null || status === 'draft' || status === 'quote_requested';
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
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
  const [note, setNote] = useState('');
  const qty = useMemo(() => sizes.S + sizes.M + sizes.L + sizes.XL, [sizes]);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const o = await getOrder(id);
      setOrder(o);
      setMaterialId(o.material_id ?? null);
      setColor(o.color ?? '');
      setSizes(parseSizesToBreakdown(o.sizes));
      setNote(o.customer_note ?? '');
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
      setError(e instanceof ApiError ? `GET /api/orders/${id} failed (${e.status}): ${e.message}` : 'Could not load order');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSave() {
    if (!order) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await updateOrder(order.id, {
        material_id: materialId,
        color: color || null,
        sizes,
        qty_total: qty,
        customer_note: note || null,
      });
      setOrder(updated);
      setInfo('Saved.');
    } catch (e) {
      setError(e instanceof ApiError ? `PUT /api/orders/${order.id} failed: ${e.message}` : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function onQuote() {
    if (!order) return;
    // Defensive profile gate (designer already gates): frontend only.
    try {
      const profile = await getProfile();
      if (!profileComplete(profile)) {
        setError(PROFILE_REQUIRED_MSG);
        nav(`/account?next=${encodeURIComponent(`/orders/${order.id}`)}`);
        return;
      }
    } catch {
      setError(`${PROFILE_REQUIRED_MSG} (could not verify profile — please check your account).`);
      nav(`/account?next=${encodeURIComponent(`/orders/${order.id}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const q = await requestQuote(order.id);
      setOrder(q);
      setInfo('Quote requested.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Request-quote failed');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!order) return;
    if (!window.confirm(`Confirm order #${order.id} at ₹${order.quote_price ?? '?'}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const c = await confirmOrder(order.id);
      setOrder(c);
      setInfo('Order confirmed.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Confirm failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!order) return;
    if (!window.confirm(`Delete order #${order.id}?`)) return;
    try {
      await deleteOrder(order.id);
      nav('/orders');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  }

  async function onCancel() {
    if (!order) return;
    if (!window.confirm(`Cancel order #${order.id}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const c = await cancelOrder(order.id);
      setOrder(c);
      setInfo('Order cancelled.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="mx-auto max-w-4xl p-6"><p className="text-sm text-muted">Loading…</p></section>;
  if (!order) return <section className="mx-auto max-w-4xl p-6"><ErrorBox message={error ?? 'Not found'} /></section>;

  const canEdit = editable(order.status);
  const snap = parseDesignSnapshot(order.design_snapshot);
  const views: Views = snap.views
    ? {
        front: { items: (snap.views.front?.items ?? []) as FlatItem[] },
        back: { items: (snap.views.back?.items ?? []) as FlatItem[] },
        sleeveLeft: { items: (snap.views.sleeveLeft?.items ?? []) as FlatItem[] },
        sleeveRight: { items: (snap.views.sleeveRight?.items ?? []) as FlatItem[] },
      }
    : { front: { items: [] }, back: { items: [] }, sleeveLeft: { items: [] }, sleeveRight: { items: [] } };
  const currentIdx = ORDER_STATUSES.indexOf((order.status ?? 'draft') as (typeof ORDER_STATUSES)[number]);

  return (
    <section className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageTitle eyebrow="Order" title={`Order #${order.id}`} sub="Customer view — editable while draft / quote requested." />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={order.status} />
        <Link to="/orders" className="font-medium text-gold hover:text-gold-pale">← My Orders</Link>
        <Link to={`/?order=${order.id}`} className="font-medium text-gold hover:text-gold-pale">Edit in designer →</Link>
      </div>
      <ErrorBox message={error} onDismiss={() => setError(null)} />
      <InfoBox message={info} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {ORDER_STATUSES.map((s, i) => (
          <span
            key={s}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${i <= currentIdx ? 'border-gold-deep bg-gold/15 text-gold' : 'border-rule bg-graphite text-muted'} ${i === currentIdx ? 'ring-2 ring-gold/60' : ''}`}
          >
            {s}
          </span>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Garment</h2>
          <div className="space-y-3">
            <Field label="Material">
              <select className={inputCls} disabled={!canEdit} value={materialId ?? ''} onChange={(e) => setMaterialId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— choose —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.name ?? `Material #${m.id}`}</option>
                ))}
              </select>
            </Field>
            <Field label="Color">
              <div className="flex items-center gap-2">
                <input type="color" disabled={!canEdit} value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#e5e7eb'} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded-[4px] border border-rule" />
                <input className={inputCls} disabled={!canEdit} value={color} onChange={(e) => setColor(e.target.value)} placeholder="#111827 or Red" />
              </div>
            </Field>
            <div>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Sizes — total {qty}</span>
              <div className="grid grid-cols-4 gap-2">
                {(['S', 'M', 'L', 'XL'] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-center text-xs font-bold text-muted">{k}</span>
                    <input type="number" min={0} disabled={!canEdit} className={inputCls} value={sizes[k]} onChange={(e) => setSizes((s) => ({ ...s, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
                  </label>
                ))}
              </div>
            </div>
            <Field label="Customer note">
              <textarea className={inputCls} rows={3} disabled={!canEdit} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {canEdit ? (
              <button type="button" disabled={busy} onClick={() => void onSave()} className={btnPrimary}>Save changes</button>
            ) : (
              <p className="text-xs text-muted">Locked for editing in status “{order.status}”. Contact support for changes.</p>
            )}
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Quote & status</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Status</dt><dd><StatusBadge status={order.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Qty total</dt><dd className="font-medium">{order.qty_total ?? qty}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Quote price</dt><dd className="font-bold">{order.quote_price != null ? `₹${order.quote_price}` : '— pending'}</dd></div>
          </dl>
          {order.admin_note ? <p className="mt-2 rounded-[4px] border border-rule-patina bg-patina/10 p-2 text-sm text-patina-pale">Admin note: {order.admin_note}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {order.status === 'draft' || order.status == null ? (
              <button type="button" disabled={busy} onClick={() => void onQuote()} className={btnPrimary}>Request Quote</button>
            ) : null}
            {order.status === 'quoted' ? (
              <button type="button" disabled={busy} onClick={() => void onConfirm()} className={btnPrimary}>Confirm at ₹{order.quote_price ?? '?'}</button>
            ) : null}
            {order.status === 'draft' || order.status === 'quote_requested' ? (
              <button type="button" disabled={busy} onClick={() => void onCancel()} className={btnDanger}>Cancel order</button>
            ) : null}
            {canEdit ? (
              <button type="button" onClick={() => void onDelete()} className={btnDanger}>Delete</button>
            ) : null}
            <button type="button" onClick={() => void load()} className={btnSecondary}>Refetch</button>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Design preview</h2>
        <div className="mb-4">
          <div className="aspect-[4/3] min-h-[350px] overflow-hidden rounded-[4px] border border-rule">
            <ShirtViewer color={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#e5e7eb'} views={views} className="h-full w-full" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['front','back','sleeveLeft','sleeveRight'] as View[]).map((v) => (
            <div key={v}>
              <div className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold text-muted">{v}</div>
              <FlatViewEditor view={v} items={views[v].items} readOnly onChange={() => {}} />
              {views[v].items.length === 0 ? <p className="text-xs text-faint">—</p> : null}
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Design snapshot</h2>
        {snap.color ? <p className="mb-2 text-sm text-muted">Snapshot color: <span className="font-mono">{snap.color}</span></p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {(['front', 'back', 'sleeve_left', 'sleeve_right'] as const).map((z) => (
            <div key={z} className="rounded-[4px] border border-rule p-2">
              <div className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold text-muted">{z}</div>
              {(snap.zones?.[z] ?? []).length === 0 ? <p className="text-xs text-faint">—</p> : null}
              <div className="flex flex-wrap gap-2">
                {(snap.zones?.[z] ?? []).map((a, i) => (
                  <div key={i} className="w-20">
                    {a.url ? <img src={a.url} alt={a.name ?? `${z}-${i}`} className="h-16 w-20 rounded-[4px] border border-rule object-contain bg-lacquer-deep" /> : null}
                    <div className="truncate text-[11px] text-muted">{a.name ?? `art-${i}`}</div>
                    {a.url && !a.url.startsWith('blob:') ? <a href={a.url} download target="_blank" rel="noreferrer" className="text-[11px] font-medium text-gold hover:text-gold-pale">download</a> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {assets.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold text-muted">Uploaded assets ({assets.length})</div>
            <ul className="space-y-1 text-sm">
              {assets.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-[4px] border border-rule px-2 py-1">
                  <span>#{a.id} — {a.zone} — {a.file_type ?? 'file'}</span>
                  {a.file_url ? <a href={a.file_url} target="_blank" rel="noreferrer" className="font-medium text-gold hover:text-gold-pale">open</a> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
