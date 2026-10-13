import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorBox, Field, InfoBox, PageTitle, StatusBadge, btnDanger, btnPrimary, btnSecondary, inputCls } from '../components/ui';
import {
  ApiError,
  ORDER_STATUSES,
  createMaterial,
  deleteMaterial,
  deleteOrder,
  getSettings,
  listAdminOrders,
  listMaterials,
  parseStringArray,
  updateMaterial,
  updateSettings,
  type Material,
  type MaterialInput,
  type Order,
  type ViewerSettings,
} from '../lib/api';

interface MatForm {
  name: string;
  description: string;
  base_price: string;
  colors: string;
  sizes: string;
}

const EMPTY_FORM: MatForm = { name: '', description: '', base_price: '', colors: '[]', sizes: '[]' };

function toForm(m?: Material): MatForm {
  if (!m) return EMPTY_FORM;
  return {
    name: m.name ?? '',
    description: m.description ?? '',
    base_price: m.base_price != null ? String(m.base_price) : '',
    colors: JSON.stringify(m.colors ?? [], null, 2),
    sizes: JSON.stringify(m.sizes ?? [], null, 2),
  };
}

function parseJsonArrayField(raw: string): string[] | null {
  const t = raw.trim();
  if (t === '') return [];
  try {
    const p = JSON.parse(t) as unknown;
    if (Array.isArray(p)) return p.map((x) => String(x));
    return null;
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const [tab, setTab] = useState<'orders' | 'materials' | 'settings'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<MatForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<ViewerSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsInfo, setSettingsInfo] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [windField, setWindField] = useState('');
  const [swingField, setSwingField] = useState('');
  const [spinField, setSpinField] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Backend GET /api/admin/orders supports no query params — fetch all, filter client-side.
      const [o, m] = await Promise.all([listAdminOrders(), listMaterials()]);
      setOrders(o);
      setMaterials(m);
    } catch (e) {
      setError(e instanceof ApiError ? `Admin load failed (${e.status}): ${e.message}` : 'Admin load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of ORDER_STATUSES) counts[s] = 0;
    for (const o of orders) {
      const k = o.status ?? 'draft';
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [orders]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (status && (o.status ?? 'draft') !== status) return false;
      if (!needle) return true;
      const hay = [
        String(o.id),
        o.customer_name ?? '',
        o.customer_email ?? '',
        o.color ?? '',
        o.status ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [orders, q, status]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(m: Material) {
    setEditing(m);
    setForm(toForm(m));
    setFormError(null);
    setModalOpen(true);
  }

  async function onSubmitMat(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (form.name.trim().length < 2) {
      setFormError('Name must be at least 2 characters.');
      return;
    }
    const colors = parseJsonArrayField(form.colors);
    const sizes = parseJsonArrayField(form.sizes);
    if (colors === null) {
      setFormError('Colors must be valid JSON array, e.g. ["red","#111827"].');
      return;
    }
    if (sizes === null) {
      setFormError('Sizes must be valid JSON array, e.g. ["S","M","L","XL"].');
      return;
    }
    let price: number | null = null;
    if (form.base_price.trim() !== '') {
      price = Number(form.base_price);
      if (!Number.isFinite(price) || price < 0) {
        setFormError('Base price must be a non-negative number.');
        return;
      }
    }
    const input: MaterialInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      base_price: price,
      colors,
      sizes,
    };
    setBusy(true);
    try {
      if (editing) await updateMaterial(editing.id, input);
      else await createMaterial(input);
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? `Save failed (${e.status}): ${e.message}` : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteMat(m: Material) {
    if (!window.confirm(`Delete material #${m.id} (${m.name ?? 'unnamed'})?`)) return;
    setError(null);
    try {
      await deleteMaterial(m.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  }

  async function onDeleteOrder(o: Order) {
    if (!window.confirm(`Delete order #${o.id}?`)) return;
    setError(null);
    try {
      await deleteOrder(o.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  }

  async function loadSettings() {
    setSettingsLoading(true);
    setSettingsError(null);
    setSettingsInfo(null);
    try {
      const s = await getSettings();
      setSettings(s);
      setWindField(s.fabric_wind != null ? String(s.fabric_wind) : '');
      setSwingField(s.swing_strength != null ? String(s.swing_strength) : '');
      setSpinField(s.autorotate_speed != null ? String(s.autorotate_speed) : '');
    } catch (e) {
      setSettingsError(e instanceof ApiError ? e.message : 'Could not load settings');
    } finally {
      setSettingsLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'settings' && settings === null && !settingsLoading) void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function parseNumField(raw: string, label: string, min: number, max: number): number | Error {
    const t = raw.trim();
    if (t === '') return new Error(`${label} is required.`);
    const n = Number(t);
    if (!Number.isFinite(n)) return new Error(`${label} must be a number.`);
    if (n < min || n > max) return new Error(`${label} must be between ${min} and ${max}.`);
    return n;
  }

  async function onSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError(null);
    setSettingsInfo(null);
    const wind = parseNumField(windField, 'fabric_wind', 0, 1);
    if (wind instanceof Error) {
      setSettingsError(wind.message);
      return;
    }
    const swing = parseNumField(swingField, 'swing_strength', 0, 10);
    if (swing instanceof Error) {
      setSettingsError(swing.message);
      return;
    }
    const spin = parseNumField(spinField, 'autorotate_speed', -10, 10);
    if (spin instanceof Error) {
      setSettingsError(spin.message);
      return;
    }
    setSettingsBusy(true);
    try {
      const next = await updateSettings({ ...(settings ?? {}), fabric_wind: wind, swing_strength: swing, autorotate_speed: spin });
      setSettings(next);
      setSettingsInfo('Settings saved — the designer picks them up on next load.');
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageTitle eyebrow="Admin" title="Admin dashboard" sub="Orders, quotes, materials, assets. All mutations refetch + show inline errors." />
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => setTab('orders')} className={tab === 'orders' ? btnPrimary : btnSecondary}>
          Orders
        </button>
        <button type="button" onClick={() => setTab('materials')} className={tab === 'materials' ? btnPrimary : btnSecondary}>
          Materials ({materials.length})
        </button>
        <button type="button" onClick={() => setTab('settings')} className={tab === 'settings' ? btnPrimary : btnSecondary}>
          Settings
        </button>
        <button type="button" onClick={() => void (tab === 'settings' ? loadSettings() : load())} className={`${btnSecondary} ml-auto`}>
          Refresh
        </button>
      </div>
      <ErrorBox message={error} onDismiss={() => setError(null)} />

      {tab === 'orders' ? (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ORDER_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(status === s ? '' : s)}
                className={`min-h-[56px] rounded-[6px] border bg-raised p-2 text-left transition-colors ${status === s ? 'border-gold ring-1 ring-gold/60' : 'border-rule hover:border-rule-strong'}`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{s}</div>
                <div className="font-[family-name:var(--font-display)] text-2xl text-champagne">{stats[s] ?? 0}</div>
              </button>
            ))}
          </div>
          <Card>
            <div className="mb-3 flex flex-wrap gap-2">
              <select className={`${inputCls} max-w-[200px]`} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                className={`${inputCls} max-w-[280px]`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search id / name / email"
              />
            </div>
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted">No orders match.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-graphite text-muted">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2 text-right">Quote (₹)</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => (
                      <tr key={o.id} className="border-t border-rule">
                        <td className="px-3 py-2 font-medium">#{o.id}</td>
                        <td className="px-3 py-2">
                          <div>{o.customer_name ?? o.customer_email ?? `user ${o.customer_id ?? '—'}`}</div>
                          {o.customer_email && o.customer_name ? <div className="text-xs text-muted">{o.customer_email}</div> : null}
                        </td>
                        <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                        <td className="px-3 py-2">{o.qty_total ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{o.quote_price ?? '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <Link to={`/admin/orders/${o.id}`} className="inline-flex min-h-[44px] items-center font-medium text-gold hover:text-gold-pale">Edit</Link>
                            <button type="button" onClick={() => void onDeleteOrder(o)} className="min-h-[44px] font-medium text-vermilion hover:bg-vermilion/10">
                              Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : tab === 'materials' ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Materials manager — full CRUD</h2>
            <button type="button" onClick={openCreate} className={btnPrimary}>+ New material</button>
          </div>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : materials.length === 0 ? (
            <p className="text-sm text-muted">No materials. Create one to power the designer select.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-graphite text-muted">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Base ₹</th>
                    <th className="px-3 py-2">Colors</th>
                    <th className="px-3 py-2">Sizes</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => (
                    <tr key={m.id} className="border-t border-rule">
                      <td className="px-3 py-2">#{m.id}</td>
                      <td className="px-3 py-2 font-medium">{m.name ?? '—'}</td>
                      <td className="px-3 py-2">{m.base_price ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">{parseStringArray(m.colors).join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-xs">{parseStringArray(m.sizes).join(', ') || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openEdit(m)} className="min-h-[44px] font-medium text-gold hover:text-gold-pale">Edit</button>
                          <button type="button" onClick={() => void onDeleteMat(m)} className="min-h-[44px] font-medium text-vermilion hover:bg-vermilion/10">Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {modalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-lacquer-deep/80 p-4" role="dialog" aria-modal="true">
              <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[6px] border border-rule bg-raised p-6">
                <h3 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-light text-champagne">{editing ? `Edit material #${editing.id}` : 'New material'}</h3>
                <form onSubmit={onSubmitMat} className="space-y-3">
                  <Field label="Name">
                    <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </Field>
                  <Field label="Description">
                    <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                  </Field>
                  <Field label="Base price (₹)">
                    <input className={inputCls} inputMode="numeric" value={form.base_price} onChange={(e) => setForm((f) => ({ ...f, base_price: e.target.value }))} placeholder="e.g. 499" />
                  </Field>
                  <Field label="Colors (JSON array)" hint='e.g. ["red", "#111827", "white"]'>
                    <textarea className={`${inputCls} font-mono`} rows={3} value={form.colors} onChange={(e) => setForm((f) => ({ ...f, colors: e.target.value }))} />
                  </Field>
                  <Field label="Sizes (JSON array)" hint='e.g. ["S","M","L","XL"]'>
                    <textarea className={`${inputCls} font-mono`} rows={3} value={form.sizes} onChange={(e) => setForm((f) => ({ ...f, sizes: e.target.value }))} />
                  </Field>
                  <ErrorBox message={formError} onDismiss={() => setFormError(null)} />
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save'}</button>
                    <button type="button" onClick={() => setModalOpen(false)} className={btnSecondary}>Cancel</button>
                    {editing ? (
                      <button type="button" onClick={() => void onDeleteMat(editing).then(() => setModalOpen(false))} className={`${btnDanger} ml-auto`}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Viewer settings — designer defaults</h2>
            <button type="button" onClick={() => void loadSettings()} className={btnSecondary}>Reload</button>
          </div>
          {settingsLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <form onSubmit={onSaveSettings} className="max-w-md space-y-3">
              <Field label="fabric_wind (0 – 1)" hint="Default fabric flutter in the designer. Users can still override it per session.">
                <input className={inputCls} inputMode="decimal" value={windField} onChange={(e) => setWindField(e.target.value)} placeholder="e.g. 0.35" />
              </Field>
              <Field label="swing_strength (0 – 10)" hint="Fabric swing multiplier applied to camera-motion sway.">
                <input className={inputCls} inputMode="decimal" value={swingField} onChange={(e) => setSwingField(e.target.value)} placeholder="e.g. 1" />
              </Field>
              <Field label="autorotate_speed (-10 – 10)" hint="Turntable speed in the designer viewer.">
                <input className={inputCls} inputMode="decimal" value={spinField} onChange={(e) => setSpinField(e.target.value)} placeholder="e.g. 1.0" />
              </Field>
              <ErrorBox message={settingsError} onDismiss={() => setSettingsError(null)} />
              <InfoBox message={settingsInfo} />
              <button type="submit" disabled={settingsBusy} className={btnPrimary}>
                {settingsBusy ? 'Saving…' : 'Save settings'}
              </button>
            </form>
          )}
        </Card>
      )}
    </section>
  );
}
