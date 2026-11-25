import { Calendar, Home, ShoppingBag, Sparkles, User } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';

export function MobileNav() {
  const { route, navigate, cartCount, setBagOpen } = useStore();

  const itemClass = (active: boolean) =>
    `flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 min-h-[48px] px-1 text-[10px] sm:text-[11px] transition-colors cursor-pointer ${
      active ? 'text-[var(--accent)] font-medium' : 'text-[var(--muted)]'
    }`;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-30 flex min-h-14 pb-safe md:hidden border-t border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur-md"
    >
      <button type="button" onClick={() => navigate({ page: 'home' })} className={itemClass(route.page === 'home')}>
        <Home className="h-4 w-4 shrink-0" />
        <span className="truncate max-w-full">Home</span>
      </button>
      <button
        type="button"
        onClick={() => navigate({ page: 'shop' })}
        className={itemClass(route.page === 'shop' || route.page === 'product')}
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="truncate max-w-full">Shop</span>
      </button>
      <button
        type="button"
        onClick={() => navigate({ page: 'services' })}
        className={itemClass(route.page === 'services')}
      >
        <Calendar className="h-4 w-4 shrink-0" />
        <span className="truncate max-w-full">Book</span>
      </button>
      <button
        type="button"
        onClick={() => setBagOpen(true)}
        className={itemClass(route.page === 'checkout')}
      >
        <ShoppingBag className="h-4 w-4 shrink-0" />
        <span className="tabular-nums truncate max-w-full">Bag ({cartCount})</span>
      </button>
      <button
        type="button"
        onClick={() => navigate({ page: 'account' })}
        className={itemClass(route.page === 'account' || route.page === 'admin' || route.page === 'dispatch')}
      >
        <User className="h-4 w-4 shrink-0" />
        <span className="truncate max-w-full">Account</span>
      </button>
    </nav>
  );
}
