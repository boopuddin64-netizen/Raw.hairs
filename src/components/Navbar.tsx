import { useState } from 'react';
import { Menu, Moon, ShoppingBag, Sun, User, X } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';

export function Navbar() {
  const { route, navigate, theme, toggleTheme, cartCount, setBagOpen, dbUser } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isStaffOrAdmin = dbUser && ['staff', 'owneradmin'].includes(dbUser.role);
  const isDispatch = dbUser && ['dispatch', 'owneradmin'].includes(dbUser.role);

  const linkClass = (active: boolean) =>
    `whitespace-nowrap shrink-0 text-sm transition-colors duration-150 pb-0.5 border-b ${
      active
        ? 'text-[var(--ink)] border-[var(--accent)] font-medium'
        : 'text-[var(--muted)] border-transparent hover:text-[var(--ink)]'
    }`;

  const mobileGo = (target: Parameters<typeof navigate>[0]) => {
    setMobileMenuOpen(false);
    navigate(target);
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 sm:h-16 max-w-[1200px] items-center justify-between gap-3 sm:gap-8 px-4 sm:px-5">
          <button
            type="button"
            onClick={() => mobileGo({ page: 'home' })}
            className="font-display text-xl sm:text-2xl font-semibold tracking-[0.14em] sm:tracking-[0.18em] text-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            RAW.HAIRS
          </button>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-7">
            <button
              type="button"
              onClick={() => navigate({ page: 'shop' })}
              className={`${linkClass(route.page === 'shop' || route.page === 'product')} cursor-pointer`}
            >
              Shop
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'services' })}
              className={`${linkClass(route.page === 'services')} cursor-pointer`}
            >
              Salon Care
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'quote' })}
              className={`${linkClass(route.page === 'quote')} cursor-pointer`}
            >
              Int&apos;l Quote
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'track' })}
              className={`${linkClass(route.page === 'track')} cursor-pointer`}
            >
              Track Order
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'help', topic: 'delivery' })}
              className={`${linkClass(route.page === 'help')} cursor-pointer`}
            >
              Help
            </button>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => navigate({ page: 'account' })}
              aria-label="Account"
              className="hidden sm:inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm text-[var(--soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <User className="h-4 w-4" />
              <span>{dbUser ? dbUser.fullName?.split(' ')[0] || 'Account' : 'Sign In'}</span>
            </button>

            <button
              type="button"
              onClick={() => setBagOpen(true)}
              aria-label="Open shopping bag"
              className="inline-flex h-10 items-center gap-1.5 sm:gap-2 rounded-full bg-[var(--accent)] px-3.5 sm:px-5 text-[11px] sm:text-xs font-medium tracking-[0.06em] sm:tracking-[0.08em] uppercase text-[var(--accent-ink)] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="tabular-nums">Bag ({cartCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="inline-flex md:hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            aria-label="Mobile menu"
            className="fixed inset-x-3 top-16 z-50 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-2xl max-h-[calc(100vh-6rem)] overflow-y-auto"
          >
            <div className="grid gap-1">
              {[
                { label: 'Home', active: route.page === 'home', target: { page: 'home' } as const },
                { label: 'Shop Hair, Care & Tools', active: route.page === 'shop' || route.page === 'product', target: { page: 'shop' } as const },
                { label: 'Salon Care & Bookings', active: route.page === 'services', target: { page: 'services' } as const },
                { label: 'Track Order', active: route.page === 'track', target: { page: 'track' } as const },
                { label: 'International USD Quote', active: route.page === 'quote', target: { page: 'quote' } as const },
                { label: 'Delivery, Returns & Help', active: route.page === 'help', target: { page: 'help', topic: 'delivery' } as const },
                {
                  label: dbUser ? `Account (${dbUser.fullName?.split(' ')[0] || 'Member'})` : 'Sign In / Account',
                  active: route.page === 'account',
                  target: { page: 'account' } as const,
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => mobileGo(item.target)}
                  className={`flex min-h-[44px] items-center justify-between rounded-2xl px-4 text-left text-sm transition-colors cursor-pointer ${
                    item.active
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-medium'
                      : 'text-[var(--ink)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {(isDispatch || isStaffOrAdmin) && (
              <div className="mt-3 border-t border-[var(--line)] pt-3 grid gap-1">
                {isDispatch && (
                  <button
                    type="button"
                    onClick={() => mobileGo({ page: 'dispatch' })}
                    className={`flex min-h-[44px] items-center rounded-2xl px-4 text-left text-sm font-medium cursor-pointer ${
                      route.page === 'dispatch'
                        ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                        : 'text-[var(--accent)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    Dispatch Rider Portal
                  </button>
                )}
                {isStaffOrAdmin && (
                  <button
                    type="button"
                    onClick={() => mobileGo({ page: 'admin' })}
                    className={`flex min-h-[44px] items-center rounded-2xl px-4 text-left text-sm font-medium cursor-pointer ${
                      route.page === 'admin'
                        ? 'bg-[var(--champagne)] text-[var(--bg)]'
                        : 'text-[var(--champagne)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    Admin Operations Console
                  </button>
                )}
              </div>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
