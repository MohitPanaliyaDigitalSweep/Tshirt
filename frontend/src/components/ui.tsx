import type { ReactNode } from 'react';

export function ErrorBox({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-3 flex items-start justify-between gap-3 rounded-[6px] border border-vermilion/50 bg-vermilion/10 px-3 py-2 text-sm text-champagne"
    >
      <span className="break-words">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[4px] text-vermilion hover:bg-vermilion/15"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

export function InfoBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-3 rounded-[6px] border border-rule-patina bg-patina/10 px-3 py-2 text-sm text-patina-pale">
      {message}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  'min-h-[44px] w-full rounded-[4px] border border-rule bg-lacquer-deep px-3.5 py-2 text-sm text-champagne placeholder:text-mutedeep transition-colors hover:border-rule-strong/60 focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:text-mutedeep';

export const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[4px] border border-gold-deep bg-gold px-6 py-2 text-sm font-semibold text-ink transition-all duration-200 hover:-translate-y-px hover:bg-gold-pale hover:shadow-[0_18px_48px_oklch(2%_0.004_95/0.4)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none';

export const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[4px] border border-rule-strong bg-transparent px-6 py-2 text-sm font-semibold text-gold transition-all duration-200 hover:-translate-y-px hover:border-gold hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0';

export const btnGhost =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[4px] px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-50';

export const btnDanger =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[4px] border border-vermilion/60 bg-transparent px-4 py-1.5 text-sm font-semibold text-vermilion transition-colors hover:bg-vermilion/15 disabled:cursor-not-allowed disabled:opacity-50';

const STATUS_COLORS: Record<string, string> = {
  draft: 'border-rule bg-graphite text-muted',
  quote_requested: 'border-rule-strong bg-gold/10 text-gold',
  quoted: 'border-rule-patina bg-patina/10 text-patina-pale',
  confirmed: 'border-patina-deep bg-patina/15 text-patina',
  done: 'border-patina-deep bg-patina-deep/40 text-patina-pale',
  cancelled: 'border-vermilion/60 bg-vermilion/10 text-vermilion',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? 'draft';
  const cls = STATUS_COLORS[s] ?? STATUS_COLORS.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${cls}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {s.replace('_', ' ')}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-card
      className={`rounded-[6px] border border-rule bg-raised p-6 text-warm transition-all duration-200 hover:border-rule-strong/50 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  sub,
  eyebrow,
}: {
  title: string;
  sub?: string;
  eyebrow?: string;
}) {
  return (
    <div data-page-title className="mb-8">
      {eyebrow ? (
        <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.2rem,4.5vw,3.4rem)] font-light leading-[1.04] tracking-[-0.01em] text-champagne">
        {title}
      </h1>
      {sub ? <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-muted">{sub}</p> : null}
    </div>
  );
}
