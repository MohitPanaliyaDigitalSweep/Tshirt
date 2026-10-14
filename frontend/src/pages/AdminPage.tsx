import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorBox, InfoBox, Field, PageTitle, StatusBadge, btnDanger, btnPrimary, btnSecondary, inputCls } from '../components/ui';
import {
  ApiError,
  ORDER_STATUSES,
  createMaterial,
  deleteMaterial,
  deleteOrder,
  getSettings,
  listAdminOrders,
  listAssets,
  listMaterials,
  logout,
  parseDesignSnapshot,
  parseStringArray,
  updateMaterial,
  updateSettings,
  type Asset,
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

type Section = 'orders' | 'materials' | 'assets' | 'clients' | 'settings';

const SECTIONS: Array<{ key: Section; label: string; icon: string }> = [
  { key: 'orders', label: 'Orders', icon: '🧾' },
  { key: 'materials', label: 'Materials', icon: '🧵' },
  { key: 'assets', label: 'Assets', icon: '🖼' },
  { key: 'clients', label: 'Clients', icon: '👥' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

interface AssetRow extends Asset {
  orderId: number;
}

export default function AdminPage() {
  const nav = useNavigate();
  const [section, setSection] = useState<Section>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
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
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  function say(msg: string) {
    setToast(msg);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
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

  async function loadAssets() {
    setAssetsLoading(true);
    setAssetsError(null);
    try {
      const recent = [...orders]
        .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
        .slice(0, 20);
      const rows: AssetRow[] = [];
      // snapshot zone artwork counts as gallery items too (download links + zone labels)
      for (const o of recent) {
        const snap = parseDesignSnapshot(o.design_snapshot);
        for (const z of ['front', 'back', 'sleeve_left', 'sleeve_right'] as const) {
          for (const a of snap.zones?.[z] ?? []) {
            if (a.url && !a.url.startsWith('blob:') && !a.url.startsWith('data:')) {
              rows.push({ id: -rows.length - 1, order_id: o.id, zone: z, file_url: a.url, file_type: a.file_type ?? null, orderId: o.id });
            }
          }
        }
        try {
          const list = await listAssets(o.id);
          for (const a of list) rows.push({ ...a, orderId: o.id });
        } catch {
          /* order may have no asset rows */
        }
      }
      setAssets(rows);
    } catch (e) {
      setAssetsError(e instanceof ApiError ? e.message : 'Could not load assets');
    } finally {
      setAssetsLoading(false);
    }
  }

  useEffect(() => {
    if (section === 'assets' && !assetsLoading && assets.length === 0 && !assetsError && orders.length > 0) {
      void loadAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, orders.length]);

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
    const list = orders.filter((o) => {
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
    list.sort((a, b) => {
      const c = String(a.updated_at ?? '').localeCompare(String(b.updated_at ?? ''));
      return sortDesc ? -c : c;
    });
    return list;
  }, [orders, q, status, sortDesc]);

  const clients = useMemo(() => {
    const map = new Map<string, { name: string | null; email: string | null; phone: string | null; company: string | null; city: string | null; count: number }>();
    for (const o of orders) {
      const key = o.customer_email ?? `id:${o.customer_id ?? '?'}`;
      const cur = map.get(key) ?? { name: null, email: null, phone: null, company: null, city: null, count: 0 };
      cur.count += 1;
      const snap = parseDesignSnapshot(o.design_snapshot);
      void snap;
      if (!cur.name && o.customer_name) cur.name = o.customer_name;
      if (!cur.email && o.customer_email) cur.email = o.customer_email;
      map.set(key, cur);
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count);
  }, [orders]);

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
      say(editing ? `Material #${editing.id} updated.` : 'Material created.');
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
      say(`Material #${m.id} deleted.`);
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
      say(`Order #${o.id} deleted.`);
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
    if (section === 'settings' && settings === null && !settingsLoading) void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

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

  function onLogout() {
    logout();
    nav('/auth', { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-7xl flex-col gap-0 p-4 sm:p-6 lg:flex-row lg:gap-6">
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        Skip to admin content
      </a>
      {/* Distinct admin shell: sidebar */}
      <nav aria-label="Admin sections" className="mb-4 w-full shrink-0 rounded-[6px] border border-rule bg-lacquer-deep p-3 lg:mb-0 lg:w-60">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="font-[family-name:var(--font-display)] text-lg uppercase tracking-[0.18em] text-champagne">Backoffice</span>
          <span className="rounded-full border border-gold-deep bg-gold/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">admin</span>
        </div>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {SECTIONS.map((s) => (
            <li key={s.key} className="shrink-0">
              <button
                type="button"
                onClick={() => setSection(s.key)}
                aria-current={section === s.key ? 'page' : undefined}
                className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-[4px] border px-3 py-2 text-sm font-semibold transition-colors ${section === s.key ? 'border-gold-deep bg-gold text-ink' : 'border-transparent text-warm hover:border-rule hover:bg-graphite'}`}
              >
                <span aria-hidden="true" className="text-base">{s.icon}</span>
                {s.label}
                {s.key === 'orders' ? <span className="ml-auto text-xs opacity-70">{orders.length}</span> : null}
                {s.key === 'materials' ? <span className="ml-auto text-xs opacity-70">{materials.length}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-rule pt-3">
          <button type="button" onClick={onLogout} className={`${btnSecondary} w-full`}>
            Logout
          </button>
          <Link to="/" className="mt-2 flex min-h-[44px] items-center justify-center text-xs font-medium text-muted hover:text-gold">
            ← Back to storefront
          </Link>
        </div>
      </nav>

      {/* Content area */}
      <main id="admin-content" className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <PageTitle eyebrow="Admin" title={SECTIONS.find((s) => s.key === section)?.label ?? 'Admin'} sub={section === 'orders' ? 'Quotes pipeline. Row click opens the order.' : section === 'materials' ? 'Fabric catalog — full CRUD.' : section === 'assets' ? 'Artwork across the 20 most recent orders.' : section === 'clients' ? 'Customers aggregated from orders.' : 'Designer defaults.'} />
          <div className="ml-auto flex gap-2">
            {section === 'assets' ? (
              <button type="button" onClick={() => void loadAssets()} className={btnSecondary}>Reload assets</button>
            ) : (
              <button type="button" onClick={() => void (section === 'settings' ? loadSettings() : load())} className={btnSecondary}>Refresh</button>
            )}
          </div>
        </div>
        <div aria-live="polite">
          <InfoBox message={toast} />
        </div>
        <ErrorBox message={error} onDismiss={() => setError(null)} />

        {section === 'orders' ? (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ORDER_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(status === s ? '' : s)}
                  aria-pressed={status === s}
                  className={`min-h-[56px] rounded-[6px] border bg-raised p-2 text-left transition-colors ${status === s ? 'border-gold ring-1 ring-gold/60' : 'border-rule hover:border-rule-strong'}`}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{s}</div>
                  <div className="font-[family-name:var(--font-display)] text-2xl text-champagne">{stats[s] ?? 0}</div>
                </button>
              ))}
            </div>
            <div className="rounded-[6px] border border-rule bg-raised p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <select className={`${inputCls} max-w-[200px]`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter orders by status">
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
                  aria-label="Search orders"
                />
                <button type="button" onClick={() => setSortDesc((d) => !d)} className={btnSecondary} aria-label={`Sort by updated ${sortDesc ? 'descending' : 'ascending'}`}>
                  Updated {sortDesc ? '↓' : '↑'}
                </button>
              </div>
              {loading ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted">No orders match.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-graphite text-muted">
                      <tr>
                        <th scope="col" className="px-3 py-2">Order</th>
                        <th scope="col" className="px-3 py-2">Customer</th>
                        <th scope="col" className="px-3 py-2">Material</th>
                        <th scope="col" className="px-3 py-2">Qty</th>
                        <th scope="col" className="px-3 py-2">Status</th>
                        <th scope="col" className="px-3 py-2">Updated</th>
                        <th scope="col" className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((o) => (
                        <tr key={o.id} className="cursor-pointer border-t border-rule hover:bg-graphite/60" onClick={() => nav(`/admin/orders/${o.id}`)}>
                          <td className="px-3 py-2 font-medium">#{o.id}</td>
                          <td className="px-3 py-2">
                            <div>{o.customer_name ?? o.customer_email ?? `user ${o.customer_id ?? '—'}`}</div>
                            {o.customer_email && o.customer_name ? <div className="text-xs text-muted">{o.customer_email}</div> : null}
                          </td>
                          <td className="px-3 py-2 text-xs">{o.material_name ?? (o.material_id != null ? `#${o.material_id}` : '—')}</td>
                          <td className="px-3 py-2">{o.qty_total ?? '—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                          <td className="px-3 py-2 text-xs text-muted">{o.updated_at ? String(o.updated_at).slice(0, 16).replace('T', ' ') : '—'}</td>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-2">
                              <Link to={`/admin/orders/${o.id}`} className="inline-flex min-h-[44px] items-center font-medium text-gold hover:text-gold-pale">Open</Link>
                              <button type="button" onClick={() => void onDeleteOrder(o)} className="min-h-[44px] font-medium text-vermilion hover:bg-vermilion/10" aria-label={`Delete order ${o.id}`}>
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
            </div>
          </>
        ) : section === 'materials' ? (
          <div className="rounded-[6px] border border-rule bg-raised p-4">
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
                      <th scope="col" className="px-3 py-2">ID</th>
                      <th scope="col" className="px-3 py-2">Name</th>
                      <th scope="col" className="px-3 py-2">Base ₹</th>
                      <th scope="col" className="px-3 py-2">Colors</th>
                      <th scope="col" className="px-3 py-2">Sizes</th>
                      <th scope="col" className="px-3 py-2">Actions</th>
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
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-lacquer-deep/80 p-4" role="dialog" aria-modal="true" aria-label={editing ? `Edit material ${editing.id}` : 'New material'}>
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
          </div>
        ) : section === 'assets' ? (
          <div className="rounded-[6px] border border-rule bg-raised p-4">
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Assets gallery — recent orders</h2>
            <ErrorBox message={assetsError} onDismiss={() => setAssetsError(null)} />
            {assetsLoading ? (
              <p className="text-sm text-muted">Loading assets…</p>
            ) : assets.length === 0 ? (
              <p className="text-sm text-muted">No artwork found in recent orders.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {assets.map((a) => (
                  <figure key={`${a.orderId}-${a.id}-${a.file_url}`} className="overflow-hidden rounded-[6px] border border-rule bg-lacquer-deep">
                    {a.file_url ? (
                      <img src={a.file_url} alt={`Order ${a.orderId} ${a.zone ?? ''} artwork`} className="h-40 w-full bg-graphite object-contain" loading="lazy" crossOrigin="anonymous" />
                    ) : (
                      <div className="flex h-40 items-center justify-center text-xs text-faint">no preview</div>
                    )}
                    <figcaption className="flex items-center justify-between gap-2 p-2 text-xs">
                      <span className="min-w-0">
                        <span className="font-bold">Order #{a.orderId}</span>
                        <span className="ml-2 rounded-full border border-rule px-1.5 py-0.5 font-mono uppercase text-muted">{a.zone ?? '—'}</span>
                      </span>
                      {a.file_url ? (
                        <a href={a.file_url} download target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center font-medium text-gold hover:text-gold-pale">
                          Download
                        </a>
                      ) : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        ) : section === 'clients' ? (
          <div className="rounded-[6px] border border-rule bg-raised p-4">
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Clients — from orders ({clients.length})</h2>
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="text-sm text-muted">No customers yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-graphite text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2">Name</th>
                      <th scope="col" className="px-3 py-2">Email</th>
                      <th scope="col" className="px-3 py-2">Phone</th>
                      <th scope="col" className="px-3 py-2">Company</th>
                      <th scope="col" className="px-3 py-2">City</th>
                      <th scope="col" className="px-3 py-2">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr key={c.key} className="border-t border-rule">
                        <td className="px-3 py-2 font-medium">{c.name ?? '—'}</td>
                        <td className="px-3 py-2">{c.email ?? c.key}</td>
                        <td className="px-3 py-2">{c.phone ?? '—'}</td>
                        <td className="px-3 py-2">{c.company ?? '—'}</td>
                        <td className="px-3 py-2">{c.city ?? '—'}</td>
                        <td className="px-3 py-2 font-bold">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-faint">Name/email come from order rows; phone/company/city fill in once the profile endpoint exposes them on orders.</p>
          </div>
        ) : (
          <div className="rounded-[6px] border border-rule bg-raised p-4">
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
          </div>
        )}
      </main>
    </div>
  );
}
