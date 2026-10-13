import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorBox, Field, PageTitle, StatusBadge, btnPrimary, inputCls } from '../components/ui';
import { ApiError, getOrder, type Order } from '../lib/api';

export default function QuotePage() {
  const [ref, setRef] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCheck(e: React.FormEvent) {
    e.preventDefault();
    const clean = ref.trim().replace(/^ORD-?/i, '');
    if (!clean) {
      setError('Enter an order reference, e.g. 12 or ORD-12.');
      return;
    }
    setBusy(true);
    setError(null);
    setOrder(null);
    try {
      setOrder(await getOrder(clean));
    } catch (err) {
      setError(err instanceof ApiError ? `Lookup failed (${err.status}): ${err.message}` : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageTitle eyebrow="Quote" title="Quote status" sub="draft → quote requested → quoted → confirmed → done" />
      <Card>
        <form className="flex gap-2" onSubmit={onCheck}>
          <input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Order reference, e.g. 12" aria-label="Order reference" />
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? '…' : 'Check'}
          </button>
        </form>
        <div className="mt-3">
          <ErrorBox message={error} onDismiss={() => setError(null)} />
        </div>
        {order ? (
          <div className="mt-2 rounded-[6px] border border-rule bg-lacquer-deep p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-[family-name:var(--font-display)] text-xl text-champagne">Order #{order.id}</span>
              <StatusBadge status={order.status} />
            </div>
            <div className="mt-3">
              <Field label="Quote price">
                <div className="text-2xl font-semibold text-gold">{order.quote_price != null ? `₹${order.quote_price}` : 'Pending — admin has not quoted yet.'}</div>
              </Field>
            </div>
            {order.admin_note ? <p className="mt-2 text-sm text-muted">Note: {order.admin_note}</p> : null}
            <Link to={`/orders/${order.id}`} className="mt-3 inline-block font-medium text-gold hover:text-gold-pale">
              Open full order →
            </Link>
          </div>
        ) : (
          <p className="mt-4 rounded-[6px] border border-dashed border-rule p-6 text-center text-sm text-faint">No quote looked up yet.</p>
        )}
      </Card>
    </section>
  );
}
