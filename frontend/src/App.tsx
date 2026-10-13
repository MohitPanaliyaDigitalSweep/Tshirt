import gsap from 'gsap';
import { useEffect, useRef } from 'react';
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
import { logout } from './lib/api';
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

function Nav() {
  const { token, role } = useSession();
  const nav = useNavigate();
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
          {token ? (
            <>
              <NavLink to="/account" className={navLinkCls}>Account</NavLink>
              <span className="rounded-full border border-rule-patina bg-patina/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-patina">
                {role ?? 'customer'}
              </span>
              <button
                type="button"
                onClick={() => {
                  logout();
                  nav('/auth', { replace: true });
                }}
                className="min-h-[44px] rounded-[4px] border border-rule px-4 text-sm font-semibold text-warm transition-colors hover:border-rule-strong hover:text-gold"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="inline-flex min-h-[44px] items-center rounded-[4px] border border-gold-deep bg-gold px-5 text-sm font-semibold text-ink transition-all duration-200 hover:-translate-y-px hover:bg-gold-pale"
            >
              Login
            </Link>
          )}
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
