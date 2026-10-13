import { useEffect, useState } from 'react';
import { Card, ErrorBox, Field, InfoBox, PageTitle, btnPrimary, inputCls } from '../components/ui';
import { ApiError, getProfile, updateProfile } from '../lib/api';

export default function AccountPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await getProfile();
        if (!alive || !p) return;
        setName(p.name ?? '');
        setEmail(p.email ?? '');
        setPhone(p.phone ?? '');
        setCompany(p.company ?? '');
        setAddress(p.address ?? '');
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e.message : 'Could not load profile');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const p = await updateProfile({
        name: name.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        address: address.trim() || null,
      });
      setName(p.name ?? '');
      setPhone(p.phone ?? '');
      setCompany(p.company ?? '');
      setAddress(p.address ?? '');
      setInfo('Profile saved.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setUnsupported(true);
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Save failed');
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-2xl p-4 sm:p-6">
        <PageTitle eyebrow="Account" title="Account" sub="Your profile details." />
        <Card>
          <div className="animate-pulse space-y-3">
            <div className="h-11 rounded-[4px] bg-graphite" />
            <div className="h-11 rounded-[4px] bg-graphite" />
            <div className="h-11 rounded-[4px] bg-graphite" />
            <div className="h-20 rounded-[4px] bg-graphite" />
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageTitle eyebrow="Account" title="Account" sub="Name, phone, company and address — used for quotes and orders." />
      <ErrorBox message={error} onDismiss={() => setError(null)} />
      <InfoBox message={info} />
      <Card>
        <form onSubmit={onSave} className="space-y-4">
          <Field label="Email (read-only)">
            <input className={inputCls} value={email} disabled readOnly />
          </Field>
          <Field label="Name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" autoComplete="tel" />
            </Field>
            <Field label="Company">
              <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" autoComplete="organization" />
            </Field>
          </div>
          <Field label="Address">
            <textarea className={inputCls} rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, postcode…" autoComplete="street-address" />
          </Field>
          <button type="submit" disabled={busy || unsupported} className={btnPrimary}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
          {unsupported ? <p className="text-xs text-faint">The server does not support profile fields yet — your input is kept locally in this form only.</p> : null}
        </form>
      </Card>
    </section>
  );
}
