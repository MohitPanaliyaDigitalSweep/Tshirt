import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { current, logout, type CurrentUser } from './lib/api';
import { useSession } from './lib/session';
import AccountPage from './pages/AccountPage';
import AdminOrderPage from './pages/AdminOrderPage';
import AdminPage from './pages/AdminPage';
import AuthPage from './pages/AuthPage';
import DesignerPage from './pages/DesignerPage';
import OrderDetailPage from './pages/OrderDetailPage';
import OrdersPage from './pages/OrdersPage';
import QuotePage from './pages/QuotePage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  if (!token) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { token, role } = useSession();
  if (!token) return <Navigate to="/auth" replace />;
  if (role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

const navLinkCls = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-[44px] items-center px-1 text-sm font-medium transition-colors ${
    isActive ? 'text-gold' : 'text-warm hover:text-gold'
  }`;

function AccountMenu() {
  const { token, role } = useSession();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setUser(null);
      return;
    }
    current()
      .then((u) => {
        if (alive) setUser(u);
      })
      .catch(() => {
        if (alive) setUser(null);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open ]);

  const close = () => {
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = itemRefs.current.filter(Boolean) as HTMLElement[];
      if (items.length === 0) return;
      const active = document.activeElement;
      let idx = items.findIndex((el) => el === active);
      if (e.key === 'ArrowDown') idx = idx < 0 ? 0 : (idx + 1) % items.length;
      else idx = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length;
      items[idx]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const initial = (user?.name || user?.email || '').trim().charAt(0).toUpperCase();
  const menuItemCls =
    'flex min-h-[44px] w-full items-center gap-2 px-4 py-2 text-left text-sm text-warm hover:bg-graphite hover:text-gold focus-visible:outline-2 focus-visible:outline-gold';

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={token ? `Account menu (${user?.email ?? role ?? 'account'})` : 'Account menu (signed out)'}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-rule bg-graphite text-sm font-bold text-gold transition-colors hover:border-gold-deep"
      >
        {token ? (
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-base font-bold text-ink">
            {initial || '•'}
          </span>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-warm">
            <circle cx="10" cy="6.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3.5 16.5c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-[6px] border border-rule bg-lacquer-deep shadow-2xl"
        >
          {token ? (
            <>
              <div className="border-b border-rule px-4 py-3">
                <p className="truncate text-sm font-semibold text-champagne">{user?.name || 'Account'}</p>
                {user?.email ? <p className="truncate text-xs text-muted">{user.email}</p> : null}
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-patina">{role ?? 'customer'}</p>
              </div>
              <Link
                ref={(el) => {
                  itemRefs.current[0] = el;
                }}
                to="/account"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={menuItemCls}
              >
                Profile
              </Link>
              <Link
                ref={(el) => {
                  itemRefs.current[1] = el;
                }}
                to="/orders"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={menuItemCls}
              >
                My Orders
              </Link>
              {role === 'admin' ? (
                <Link
                  ref={(el) => {
                    itemRefs.current[2] = el;
                  }}
                  to="/admin"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={menuItemCls}
                >
                  Dashboard
                </Link>
              ) : null}
              <button
                ref={(el) => {
                  itemRefs.current[3] = el;
                }}
                type="button"
                role="menuitem"
                onClick={() => {
                  logout();
                  setUser(null);
                  setOpen(false);
                  nav('/auth', { replace: true });
                }}
                className={`${menuItemCls} border-t border-rule`}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                ref={(el) => {
                  itemRefs.current[0] = el;
                }}
                to="/auth?mode=login"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={menuItemCls}
              >
                Sign in
              </Link>
              <Link
                ref={(el) => {
                  itemRefs.current[1] = el;
                }}
                to="/auth?mode=register"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={menuItemCls}
              >
                Create account
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Nav() {
  const { role } = useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-lacquer/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-8" aria-label="Main">
        <Link
          to="/"
          className="mr-2 flex min-h-[44px] items-center gap-2.5 font-[family-name:var(--font-display)] text-sm uppercase tracking-[0.22em] text-champagne"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="text-gold">
            <rect width="22" height="22" rx="2" fill="currentColor" />
            <path d="M4 18 L18 4" stroke="oklch(7% 0.006 95)" strokeWidth="2.5" />
          </svg>
          Tshirt&nbsp;Studio
        </Link>
        <NavLink to="/" end className={navLinkCls}>Designer</NavLink>
        <NavLink to="/orders" className={navLinkCls}>My Orders</NavLink>
        <NavLink to="/quote" className={navLinkCls}>Quote</NavLink>
        {role === 'admin' ? (
          <NavLink to="/admin" className={navLinkCls}>Admin</NavLink>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-full border border-rule-patina bg-patina/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-patina sm:inline">
            {role ?? 'guest'}
          </span>
          <AccountMenu />
        </span>
      </nav>
    </header>
  );
}

/** Route-scoped page-enter animation; no-op under prefers-reduced-motion. */
function PageShell() {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all' },
    );
    return () => {
      tween.kill();
    };
  }, [location.pathname]);
  return (
    <div ref={ref} key={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<DesignerPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/quote" element={<QuotePage />} />
        <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="/admin/orders/:id" element={<RequireAdmin><AdminOrderPage /></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <main>
        <PageShell />
      </main>
    </BrowserRouter>
  );
}
