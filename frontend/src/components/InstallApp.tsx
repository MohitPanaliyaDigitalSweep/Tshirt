import { useEffect, useRef, useState } from 'react';
import { useInstallApp } from '../lib/useInstallApp';

const DISMISS_KEY = 'ts-install-banner-dismissed';

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Shared gold download glyph (kinpaku theme, aria-hidden). */
function InstallGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M10 2.5v10m0 0L5.5 8M10 12.5L14.5 8M3.5 15.5v1.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** iOS manual-install guide: Share → Add to Home Screen → Add. */
export function InstallGuideSheet({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const steps = [
    { icon: '⎙', title: 'Tap the Share icon', body: 'In Safari, tap Share in the toolbar at the bottom (iPhone) or top (iPad).' },
    { icon: '＋', title: 'Choose “Add to Home Screen”', body: 'Scroll the share sheet down and tap “Add to Home Screen”.' },
    { icon: '✓', title: 'Tap Add', body: 'Confirm the name “Tshirt Studio”, then tap Add. The app icon appears on your Home Screen.' },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/70 p-4 sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-guide-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-[6px] border border-rule bg-lacquer-deep p-6 shadow-2xl focus:outline-gold"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold">
              iOS install
            </p>
            <h2 id="install-guide-title" className="font-[family-name:var(--font-display)] text-xl font-light text-champagne">
              Install Tshirt Studio
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install guide"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[4px] text-muted hover:bg-graphite hover:text-gold"
          >
            ✕
          </button>
        </div>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-[4px] border border-rule bg-raised p-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-base font-bold text-ink"
              >
                {s.icon}
              </span>
              <span>
                <span className="block text-sm font-semibold text-champagne">
                  {i + 1}. {s.title}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          iPhone / iPad Safari doesn&apos;t support automatic install, so adding from the share sheet is the
          Apple-supported path.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-[4px] border border-gold-deep bg-gold px-6 py-2 text-sm font-semibold text-ink transition-colors hover:bg-gold-pale"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/**
 * "Install App" entry for the account menu.
 * Hidden when installed, or when no prompt is available AND not iOS
 * (e.g. Firefox desktop — nothing useful to offer, so hide).
 */
export function InstallMenuItem({
  onDone,
  buttonRef,
}: {
  onDone?: () => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}) {
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallApp();
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (isInstalled) return null;
  if (!canInstall && !isIOS) return null;

  const menuItemCls =
    'flex min-h-[44px] w-full items-center gap-2 px-4 py-2 text-left text-sm text-warm hover:bg-graphite hover:text-gold focus-visible:outline-2 focus-visible:outline-gold';

  const handle = async () => {
    if (isIOS && !canInstall) {
      setGuideOpen(true);
      return;
    }
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
      onDone?.();
    }
  };

  return (
    <>
      <button type="button" role="menuitem" ref={buttonRef} onClick={handle} disabled={busy} className={menuItemCls}>
        <span className="text-gold" aria-hidden="true">
          <InstallGlyph />
        </span>
        {busy ? 'Installing…' : 'Install App'}
      </button>
      {guideOpen ? <InstallGuideSheet onClose={() => { setGuideOpen(false); onDone?.(); }} /> : null}
    </>
  );
}

/**
 * Dismissible install banner/card for the home/designer.
 * Renders null when installed, dismissed, or when there is nothing actionable
 * (no deferred prompt AND not iOS).
 */
export default function InstallAppBanner() {
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallApp();
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissed());
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (isInstalled || dismissed) return null;
  // Firefox desktop etc.: no prompt and not iOS → hide (per spec).
  if (!canInstall && !isIOS) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode — session-only dismiss */
    }
  };

  const handleInstall = async () => {
    if (isIOS && !canInstall) {
      setGuideOpen(true);
      return;
    }
    // User gesture only — never auto-prompted.
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section
        aria-label="Install Tshirt Studio app"
        data-testid="install-banner"
        className="mb-4 flex flex-wrap items-center gap-3 rounded-[6px] border border-rule-strong bg-raised px-4 py-3 shadow-[0_8px_28px_oklch(2%_0.004_95/0.35)]"
      >
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-ink">
          <InstallGlyph />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-semibold text-champagne">Install Tshirt Studio</p>
          <p className="truncate text-xs text-muted sm:whitespace-normal">
            {isIOS && !canInstall
              ? 'Add to your Home Screen for a full-screen studio.'
              : 'Add to your home screen or desktop for a full-screen studio.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstall}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[4px] border border-gold-deep bg-gold px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-gold-pale disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Installing…' : isIOS && !canInstall ? 'How to install' : 'Install App'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install suggestion"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[4px] text-muted hover:bg-graphite hover:text-gold"
          >
            ✕
          </button>
        </div>
      </section>
      {guideOpen ? <InstallGuideSheet onClose={() => setGuideOpen(false)} /> : null}
    </>
  );
}
