import { Minus, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { formatNaira } from '../types.ts';
import { SafeImage } from './SafeImage.tsx';

export function BagDrawer() {
  const { bagOpen, setBagOpen, cart, updateCartQty, removeFromCart, cartSubtotalNgn, navigate } =
    useStore();

  if (!bagOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
        onClick={() => setBagOpen(false)}
        aria-hidden="true"
      />
      <aside
        aria-label="Shopping bag"
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] sm:rounded-l-3xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 sm:px-6 py-4 sm:py-5">
          <div className="min-w-0 pr-2">
            <h2 className="font-display text-2xl font-medium">Your Bag</h2>
            <p className="text-xs text-[var(--muted)]">
              Stock is held for 15 minutes once you begin checkout.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBagOpen(false)}
            aria-label="Close bag"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center py-12">
              <p className="font-display text-2xl text-[var(--soft)]">Your bag is empty.</p>
              <p className="mt-2 text-sm text-[var(--muted)] max-w-xs">
                Explore virgin bundles, silk care elixirs, straighteners, curlers, and precision tools.
              </p>
              <button
                type="button"
                onClick={() => {
                  setBagOpen(false);
                  navigate({ page: 'shop' });
                }}
                className="mt-6 min-h-[44px] rounded-full bg-[var(--accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)] cursor-pointer"
              >
                Shop Collection
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {cart.map((line) => (
                <div key={line.variantId} className="flex gap-3 sm:gap-4 py-4">
                  <SafeImage
                    src={line.imageUrl}
                    alt={line.productName}
                    title={line.productName}
                    className="h-20 w-20 shrink-0 rounded-xl object-cover border border-[var(--line)]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBagOpen(false);
                          navigate({ page: 'product', slug: line.productSlug });
                        }}
                        className="text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--accent)] truncate cursor-pointer"
                      >
                        {line.productName}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(line.variantId)}
                        aria-label={`Remove ${line.productName}`}
                        className="text-[var(--muted)] hover:text-[var(--bad)] p-1.5 rounded-full cursor-pointer shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="mt-1 text-xs text-[var(--muted)] truncate">
                      {line.lengthInches > 0 ? `${line.lengthInches}" · ` : ''}
                      {line.laceType}
                    </p>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center rounded-full border border-[var(--line-2)] px-1">
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.variantId, line.quantity - 1)}
                          aria-label="Decrease quantity"
                          className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] cursor-pointer"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-7 text-center text-xs font-mono-num">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.variantId, line.quantity + 1)}
                          aria-label="Increase quantity"
                          disabled={line.quantity >= line.maxStock}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] disabled:opacity-40 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-mono-num font-medium">
                        {formatNaira(line.priceNgn * line.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-[var(--line)] bg-[var(--surface-2)] px-4 sm:px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">Subtotal</span>
              <span className="text-base font-mono-num font-medium">{formatNaira(cartSubtotalNgn)}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Rivers State LGA or interstate delivery fee calculated at checkout.
            </p>
            <button
              type="button"
              onClick={() => {
                setBagOpen(false);
                navigate({ page: 'checkout' });
              }}
              className="mt-4 w-full min-h-[46px] rounded-full bg-[var(--accent)] py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] hover:opacity-90 transition-opacity cursor-pointer"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
