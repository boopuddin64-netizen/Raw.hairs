import { useStore } from '../context/StoreContext.tsx';

export function Footer() {
  const { navigate, dbUser } = useStore();

  const isStaffOrAdmin = dbUser && ['staff', 'owneradmin'].includes(dbUser.role);
  const isDispatch = dbUser && ['dispatch', 'owneradmin'].includes(dbUser.role);

  return (
    <footer className="border-t border-[var(--line)] bg-[var(--surface-2)] pb-20 md:pb-10 pt-12">
      <div className="mx-auto max-w-[1200px] px-5">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <p className="font-display text-2xl tracking-[0.18em] text-[var(--accent)]">RAW.HAIRS</p>
            <p className="mt-3 text-sm text-[var(--muted)] max-w-xs">
              Single-donor virgin hair bundles, HD lace units, botanical hair care, and salon styling tools delivered across Port Harcourt, Rivers State, Nigeria, and worldwide.
            </p>
            <p className="mt-3 text-xs text-[var(--soft)]">
              Flagship Studio · New GRA, Port Harcourt, Rivers State
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--champagne)]">Customer Care</p>
            <div className="mt-3 grid grid-cols-2 gap-y-2 gap-x-4 text-sm text-[var(--muted)]">
              <button type="button" onClick={() => navigate({ page: 'help', topic: 'contact' })} className="text-left hover:text-[var(--ink)] cursor-pointer">
                Contact
              </button>
              <button type="button" onClick={() => navigate({ page: 'help', topic: 'faqs' })} className="text-left hover:text-[var(--ink)] cursor-pointer">
                FAQs
              </button>
              <button type="button" onClick={() => navigate({ page: 'help', topic: 'delivery' })} className="text-left hover:text-[var(--ink)] cursor-pointer">
                Delivery &amp; Shipping
              </button>
              <button type="button" onClick={() => navigate({ page: 'help', topic: 'returns' })} className="text-left hover:text-[var(--ink)] cursor-pointer">
                48h Returns
              </button>
              <button type="button" onClick={() => navigate({ page: 'help', topic: 'privacy' })} className="text-left hover:text-[var(--ink)] cursor-pointer">
                Privacy Policy
              </button>
              <button type="button" onClick={() => navigate({ page: 'help', topic: 'terms' })} className="text-left hover:text-[var(--ink)] cursor-pointer">
                Terms
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--champagne)]">Connect &amp; Track</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--muted)]">
              <a
                href="https://www.instagram.com/raw.hairs"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-[var(--ink)]"
              >
                Instagram · @raw.hairs
              </a>
              <button type="button" onClick={() => navigate({ page: 'track' })} className="text-left hover:text-[var(--ink)] cursor-pointer">
                Track Nigerian Order
              </button>
              <button type="button" onClick={() => navigate({ page: 'quote' })} className="text-left hover:text-[var(--ink)] cursor-pointer">
                International Quote Request
              </button>
              {(isDispatch || isStaffOrAdmin) && (
                <div className="mt-2 pt-2 border-t border-[var(--line)] flex gap-4 text-xs">
                  {isDispatch && (
                    <button
                      type="button"
                      onClick={() => navigate({ page: 'dispatch' })}
                      className="text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Rider Queue
                    </button>
                  )}
                  {isStaffOrAdmin && (
                    <button
                      type="button"
                      onClick={() => navigate({ page: 'admin' })}
                      className="text-[var(--champagne)] hover:underline cursor-pointer"
                    >
                      Admin Operations
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-[var(--line)] pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[var(--muted)]">
          <span>© {new Date().getFullYear()} Raw.hairs. Port Harcourt, Rivers State, Nigeria.</span>
          <span>Single-Donor Certified · 48-Hour Return Guarantee</span>
        </div>
      </div>
    </footer>
  );
}
