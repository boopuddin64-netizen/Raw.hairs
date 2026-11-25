import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiRequest } from '../lib/api.ts';
import type {
  CartLine,
  Category,
  CommerceSettings,
  DbUser,
  Product,
  SalonService,
} from '../types.ts';

export type AppRoute =
  | { page: 'home' }
  | { page: 'shop'; category?: string }
  | { page: 'product'; slug: string }
  | { page: 'services' }
  | { page: 'checkout'; payRef?: string }
  | { page: 'quote' }
  | { page: 'track' }
  | { page: 'help'; topic?: string }
  | { page: 'account' }
  | { page: 'dispatch' }
  | { page: 'admin' };

interface ToastItem {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
}

interface StoreContextValue {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  route: AppRoute;
  navigate: (next: AppRoute) => void;
  categories: Category[];
  products: Product[];
  services: SalonService[];
  settings: CommerceSettings | null;
  loadingCatalog: boolean;
  catalogError: string;
  refreshCatalog: () => Promise<void>;
  cart: CartLine[];
  bagOpen: boolean;
  setBagOpen: (open: boolean) => void;
  addToCart: (line: CartLine) => void;
  updateCartQty: (variantId: number, qty: number) => void;
  removeFromCart: (variantId: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartSubtotalNgn: number;
  firebaseUser: User | null;
  dbUser: DbUser | null;
  authReady: boolean;
  getIdToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshDbUser: () => Promise<void>;
  notify: (text: string, tone?: 'ok' | 'error' | 'info') => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const CART_STORAGE_KEY = 'rawhairs_bag_v1';
const THEME_STORAGE_KEY = 'rawhairs_theme_v1';

function parseInitialRoute(): AppRoute {
  const params = new URLSearchParams(window.location.search);
  const pay = params.get('pay');
  if (pay) return { page: 'checkout', payRef: pay };
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash || hash === '/') return { page: 'home' };
  const [segment, param] = hash.replace(/^\//, '').split('/');
  switch (segment) {
    case 'shop':
      return { page: 'shop', category: param || undefined };
    case 'product':
      return param ? { page: 'product', slug: param } : { page: 'shop' };
    case 'services':
      return { page: 'services' };
    case 'checkout':
      return { page: 'checkout' };
    case 'quote':
      return { page: 'quote' };
    case 'track':
      return { page: 'track' };
    case 'help':
      return { page: 'help', topic: param || 'delivery' };
    case 'account':
      return { page: 'account' };
    case 'dispatch':
      return { page: 'dispatch' };
    case 'admin':
      return { page: 'admin' };
    default:
      return { page: 'home' };
  }
}

function routeToHash(r: AppRoute): string {
  switch (r.page) {
    case 'home':
      return '#/';
    case 'shop':
      return r.category ? `#/shop/${encodeURIComponent(r.category)}` : '#/shop';
    case 'product':
      return `#/product/${encodeURIComponent(r.slug)}`;
    case 'services':
      return '#/services';
    case 'checkout':
      return '#/checkout';
    case 'quote':
      return '#/quote';
    case 'track':
      return '#/track';
    case 'help':
      return r.topic ? `#/help/${encodeURIComponent(r.topic)}` : '#/help/delivery';
    case 'account':
      return '#/account';
    case 'dispatch':
      return '#/dispatch';
    case 'admin':
      return '#/admin';
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });

  const [route, setRoute] = useState<AppRoute>(() => parseInitialRoute());
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<SalonService[]>([]);
  const [settings, setSettings] = useState<CommerceSettings | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch {
      return [];
    }
  });
  const [bagOpen, setBagOpen] = useState(false);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    const onHash = () => setRoute(parseInitialRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const notify = useCallback((text: string, tone: 'ok' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const navigate = useCallback((next: AppRoute) => {
    setRoute(next);
    const nextHash = routeToHash(next);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const refreshCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError('');
    try {
      const data = await apiRequest<{
        categories: Category[];
        products: Product[];
        services: SalonService[];
        settings: CommerceSettings | null;
      }>('/api/bootstrap');
      setCategories(data.categories);
      setProducts(data.products);
      setServices(data.services);
      setSettings(data.settings);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Unable to load storefront.');
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const syncUserProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setDbUser(null);
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await apiRequest<{ user: DbUser }>('/api/auth/me', { token });
      setDbUser(res.user);
    } catch {
      setDbUser(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      await syncUserProfile(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, [syncUserProfile]);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      await syncUserProfile(cred.user);
      notify(`Welcome back, ${cred.user.displayName || cred.user.email || 'Crown'}`, 'ok');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Google sign-in cancelled.', 'error');
    }
  }, [notify, syncUserProfile]);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setDbUser(null);
    notify('Signed out of Raw.hairs.', 'info');
    if (route.page === 'admin' || route.page === 'dispatch') {
      navigate({ page: 'home' });
    }
  }, [navigate, notify, route.page]);

  const refreshDbUser = useCallback(async () => {
    await syncUserProfile(auth.currentUser);
  }, [syncUserProfile]);

  const addToCart = useCallback(
    (line: CartLine) => {
      setCart((prev) => {
        const idx = prev.findIndex((x) => x.variantId === line.variantId);
        if (idx >= 0) {
          const next = [...prev];
          const updatedQty = Math.min(line.maxStock, next[idx].quantity + line.quantity);
          next[idx] = { ...next[idx], quantity: updatedQty, maxStock: line.maxStock };
          return next;
        }
        return [...prev, line];
      });
      setBagOpen(true);
      const spec = line.lengthInches > 0 ? `${line.lengthInches}"` : line.laceType;
      notify(`Added ${line.productName} (${spec}) to your bag`, 'ok');
    },
    [notify],
  );

  const updateCartQty = useCallback((variantId: number, qty: number) => {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((item) => item.variantId !== variantId)
        : prev.map((item) =>
            item.variantId === variantId
              ? { ...item, quantity: Math.min(item.maxStock, Math.max(1, qty)) }
              : item,
          ),
    );
  }, []);

  const removeFromCart = useCallback((variantId: number) => {
    setCart((prev) => prev.filter((item) => item.variantId !== variantId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartSubtotalNgn = useMemo(
    () => cart.reduce((sum, item) => sum + item.priceNgn * item.quantity, 0),
    [cart],
  );

  const value: StoreContextValue = {
    theme,
    toggleTheme,
    route,
    navigate,
    categories,
    products,
    services,
    settings,
    loadingCatalog,
    catalogError,
    refreshCatalog,
    cart,
    bagOpen,
    setBagOpen,
    addToCart,
    updateCartQty,
    removeFromCart,
    clearCart,
    cartCount,
    cartSubtotalNgn,
    firebaseUser,
    dbUser,
    authReady,
    getIdToken,
    signInWithGoogle,
    signOutUser,
    refreshDbUser,
    notify,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 inset-x-4 sm:inset-x-auto sm:right-5 z-50 flex flex-col gap-2 sm:max-w-sm pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto rounded-2xl border border-[var(--line-2)] bg-[var(--surface)] text-[var(--ink)] px-4 py-3 text-sm shadow-lg"
            >
              <span
                className="font-medium mr-2"
                style={{
                  color:
                    t.tone === 'ok'
                      ? 'var(--ok)'
                      : t.tone === 'error'
                        ? 'var(--bad)'
                        : 'var(--accent)',
                }}
              >
                {t.tone === 'ok' ? 'Done' : t.tone === 'error' ? 'Notice' : 'Update'}
              </span>
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
