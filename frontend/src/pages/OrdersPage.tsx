import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorBox, PageTitle, StatusBadge, btnDanger, btnPrimary, btnGhost, inputCls } from '../components/ui';
import { ApiError, ORDER_STATUSES, deleteOrder, listOrders, type Order } from '../lib/api';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await listOrders(status ? { status } : {});
      setOrders(list);
    } catch (e) {
      setError(e instanceof ApiError ? `GET /api/orders failed (${e.status}): ${e.message}` : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [status]);

  async function onDelete(id: number) {
    if (!window.confirm(`Delete order #${id}? Only drafts should be deleted.`)) return;
    setBusyId(id);
    setError(null);
    try {
      await deleteOrder(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageTitle eyebrow="Orders" title="My Orders" sub="All fields editable while draft / quote requested. Confirm once quoted." />
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        <button
          type="button"
          onClick={() => setStatus('')}
          aria-pressed={status === ''}
          className={`min-h-[44px] rounded-full border px-3 text-xs font-semibold uppercase tracking-[0.1em] ${status === '' ? 'border-gold bg-gold/15 text-gold' : 'border-rule bg-graphite text-muted hover:border-rule-strong'}`}
        >
          All
        </button>
        {ORDER_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? '' : s)}
            aria-pressed={status === s}
            className={`min-h-[44px] rounded-full border px-3 text-xs font-semibold uppercase tracking-[0.1em] ${status === s ? 'border-gold bg-gold/15 text-gold' : 'border-rule bg-graphite text-muted hover:border-rule-strong'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <select className={`${inputCls} max-w-[220px]`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="draft">draft</option>
          <option value="quote_requested">quote_requested</option>
          <option value="quoted">quoted</option>
          <option value="confirmed">confirmed</option>
          <option value="done">done</option>
          <option value="cancelled">cancelled</option>
        </select>
        <button type="button" onClick={() => void load()} className={btnPrimary}>
          Refresh
        </button>
        <Link to="/" className={`${btnGhost} ml-auto`}>
          + New design
        </Link>
      </div>
      <ErrorBox message={error} onDismiss={() => setError(null)} />
      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : orders.length === 0 ? (
        <Card className="mt-4 py-12 text-center">
          <p className="text-sm text-muted">No orders yet. <Link to="/" className="font-medium text-gold hover:text-gold-pale">Start a design</Link>.</p>
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {orders.map((o) => (
            <Card key={o.id} className="hover:-translate-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/orders/${o.id}`} className="font-[family-name:var(--font-display)] text-xl text-champagne hover:text-gold">
                  Order #{o.id}
                </Link>
                <StatusBadge status={o.status} />
              </div>
              <dl className="mt-3 space-y-1.5 text-sm text-muted">
                <div className="flex justify-between gap-2"><dt>Qty</dt><dd className="font-medium text-warm">{o.qty_total ?? '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt>Color</dt><dd>{o.color ?? '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt>Quote</dt><dd className="font-medium text-gold">{o.quote_price != null ? `₹${o.quote_price}` : '—'}</dd></div>
              </dl>
              {o.customer_note ? <p className="mt-2 truncate text-xs text-faint">{o.customer_note}</p> : null}
              <div className="mt-4 flex gap-2 border-t border-rule pt-4">
                <Link to={`/orders/${o.id}`} className="inline-flex min-h-[44px] items-center rounded-[4px] border border-rule px-4 text-sm font-semibold text-warm transition-colors hover:border-rule-strong hover:text-gold">
                  Open
                </Link>
                <Link to={`/?order=${o.id}`} className="inline-flex min-h-[44px] items-center rounded-[4px] border border-rule px-4 text-sm font-semibold text-warm transition-colors hover:border-rule-strong hover:text-gold">
                  Edit in designer
                </Link>
                <div className="mt-4 flex gap-2 border-t border-rule pt-4">
                  <button type="button" disabled={busyId === o.id} onClick={() => void onDelete(o.id)} className={btnDanger}>
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => { window.location.href = '/api/orders/' + o.id + '/request-quote'; }}
                    className={btnPrimary}
                  >
                    Request Quote
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
