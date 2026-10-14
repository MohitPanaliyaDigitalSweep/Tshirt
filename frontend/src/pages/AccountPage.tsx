import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, ErrorBox, Field, InfoBox, PageTitle, btnPrimary, inputCls } from '../components/ui';
import { ApiError, PROFILE_REQUIRED_MSG, getProfile, profileComplete, updateProfile } from '../lib/api';

export default function AccountPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('');
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
        setCity(p.city ?? '');
        setPostal(p.postal_code ?? '');
        setCountry(p.country ?? '');
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
    if (city.trim().length > 60) {
      setError('City must be at most 60 characters.');
      return;
    }
    if (country.trim().length > 60) {
      setError('Country must be at most 60 characters.');
      return;
    }
    if (postal.trim().length > 20) {
      setError('Postal code must be at most 20 characters.');
      return;
    }
    setBusy(true);
    try {
      const p = await updateProfile({
        name: name.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        postal_code: postal.trim() || null,
        country: country.trim() || null,
      });
      setName(p.name ?? '');
      setPhone(p.phone ?? '');
      setCompany(p.company ?? '');
      setAddress(p.address ?? '');
      setCity(p.city ?? '');
      setPostal(p.postal_code ?? '');
      setCountry(p.country ?? '');
      if (profileComplete(p)) {
        if (safeNext) {
          nav(safeNext, { replace: true });
          return;
        }
        setInfo('Profile saved — complete, you can place orders.');
      } else {
        setInfo('Profile saved.');
      }
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

  const checklist = [
    { key: 'name', label: 'Name (≥2 characters)', done: name.trim().length >= 2 },
    { key: 'phone', label: 'Phone', done: phone.trim().length > 0 },
    { key: 'address', label: 'Street address', done: address.trim().length > 0 },
    { key: 'city', label: 'City', done: city.trim().length > 0 },
  ];
  const complete = checklist.every((c) => c.done);

  return (
    <section className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageTitle eyebrow="Account" title="Account" sub="Contact, company and address — used for quotes and orders." />
      {safeNext ? (
        <div className="mb-3 rounded-[6px] border border-gold-deep bg-gold/10 p-3 text-sm text-gold" role="alert">
          {PROFILE_REQUIRED_MSG} — you&apos;ll return to {safeNext} after saving.
        </div>
      ) : null}
      <Card>
        <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">
          Order readiness
        </h2>
        <ul className="space-y-1.5" aria-label="Profile completion checklist">
          {checklist.map((c) => (
            <li key={c.key} className="flex min-h-[44px] items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${c.done ? 'border-gold bg-gold text-ink' : 'border-rule text-faint'}`}
              >
                {c.done ? '✓' : '•'}
              </span>
              <span className={c.done ? 'text-warm' : 'text-muted'}>
                {c.label}
                <span className="sr-only">{c.done ? ' (done)' : ' (missing)'}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-faint">
          {complete
            ? 'Profile complete — you can place orders.'
            : 'Name, phone, address and city are required to place orders (country/postal optional).'}
        </p>
      </Card>
      <div className="mb-3 mt-3">
        <Link to="/orders" className="inline-flex min-h-[44px] items-center font-medium text-gold hover:text-gold-pale">
          View order history →
        </Link>
      </div>
      <ErrorBox message={error} onDismiss={() => setError(null)} />
      <InfoBox message={info} />
      <form onSubmit={onSave} className="space-y-4">
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Contact</h2>
          <div className="space-y-3">
            <Field label="Email (read-only)">
              <input className={inputCls} value={email} disabled readOnly autoComplete="email" />
            </Field>
            <Field label="Name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </Field>
            <Field label="Phone">
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" autoComplete="tel" />
            </Field>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Company</h2>
          <Field label="Company">
            <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" autoComplete="organization" />
          </Field>
        </Card>
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-normal text-champagne">Address</h2>
          <div className="space-y-3">
            <Field label="Street address">
              <textarea className={inputCls} rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area…" autoComplete="street-address" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="City">
                <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" autoComplete="address-level2" maxLength={60} />
              </Field>
              <Field label="Postal code">
                <input className={inputCls} value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="Postal code" autoComplete="postal-code" maxLength={20} />
              </Field>
            </div>
            <Field label="Country">
              <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" autoComplete="country-name" maxLength={60} />
            </Field>
          </div>
        </Card>
        <button type="submit" disabled={busy || unsupported} className={btnPrimary}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
        {unsupported ? <p className="text-xs text-faint">The server does not support profile fields yet — your input is kept locally in this form only.</p> : null}
      </form>
    </section>
  );
}
