import { useEffect, useState } from 'react';
import { ArrowLeft, Minus, Plus, ShieldCheck, Truck } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { SafeImage } from '../components/SafeImage.tsx';
import { formatNaira, type ProductVariant } from '../types.ts';

export function ProductPage({ slug }: { slug: string }) {
  const { products, navigate, addToCart, settings } = useStore();
  const product = products.find((p) => p.slug === slug);

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    if (product && product.variants.length > 0) {
      const firstAvailable = product.variants.find((v) => v.availableStock > 0) || product.variants[0];
      setSelectedVariant(firstAvailable);
      setQuantity(1);
      setActivePhoto(0);
    }
  }, [product]);

  if (!product) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center">
        <h1 className="font-display text-3xl">Piece not found</h1>
        <button
          type="button"
          onClick={() => navigate({ page: 'shop' })}
          className="mt-5 rounded-full bg-[var(--accent)] px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)] cursor-pointer"
        >
          Back to Catalogue
        </button>
      </div>
    );
  }

  const photos = product.gallery.length > 0 ? product.gallery : [product.imageUrl];
  const currentVariant = selectedVariant || product.variants[0];
  const stockCount = currentVariant ? currentVariant.availableStock : 0;
  const isHairProduct = !['hair-care', 'styling-tools'].includes(product.categorySlug);

  const handleAdd = () => {
    if (!currentVariant || stockCount <= 0) return;
    addToCart({
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      imageUrl: product.imageUrl,
      variantId: currentVariant.id,
      sku: currentVariant.sku,
      lengthInches: currentVariant.lengthInches,
      laceType: currentVariant.laceType,
      priceNgn: currentVariant.priceNgn,
      quantity,
      maxStock: stockCount,
    });
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-5 py-6 sm:py-10">
      <button
        type="button"
        onClick={() => navigate({ page: 'shop' })}
        className="inline-flex min-h-[40px] items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--ink)] mb-5 sm:mb-8 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Boutique</span>
      </button>

      <div className="grid gap-6 sm:gap-10 lg:grid-cols-2 items-start">
        <div className="lg:sticky lg:top-24 space-y-3 min-w-0">
          <div className="aspect-[4/3] overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
            <SafeImage
              src={photos[activePhoto] || product.imageUrl}
              alt={product.name}
              title={product.name}
              className="h-full w-full object-cover"
            />
          </div>
          {photos.length > 1 && (
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {photos.map((url, idx) => (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => setActivePhoto(idx)}
                  className={`h-16 w-20 sm:h-20 sm:w-24 shrink-0 overflow-hidden rounded-xl border cursor-pointer ${
                    activePhoto === idx ? 'border-[var(--accent)]' : 'border-[var(--line)]'
                  }`}
                >
                  <SafeImage src={url} alt={`${product.name} view ${idx + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-9 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
            <span>{product.texture}</span>
            <span aria-hidden="true">·</span>
            <span>{product.origin}</span>
            {currentVariant && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{currentVariant.sku}</span>
              </>
            )}
          </div>

          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-medium text-[var(--ink)]">
            {product.name}
          </h1>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] pb-5">
            <span className="text-2xl font-mono-num font-medium text-[var(--ink)]">
              {formatNaira(currentVariant?.priceNgn ?? product.basePriceNgn)}
            </span>
            <span className="text-xs font-mono-num text-[var(--muted)]">
              Int&apos;l est. ${currentVariant?.priceUsd ?? product.basePriceUsd} USD
            </span>
          </div>

          <p className="mt-5 text-sm text-[var(--soft)] leading-relaxed">{product.description}</p>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="uppercase tracking-[0.14em] text-[var(--muted)]">
                {isHairProduct ? 'Select Length & Lace' : 'Select Edition'}
              </span>
              <span
                className="font-mono-num font-medium shrink-0"
                style={{ color: stockCount > 0 ? 'var(--ok)' : 'var(--bad)' }}
              >
                {stockCount > 0 ? `${stockCount} available` : 'Out of stock'}
              </span>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {product.variants.map((variant) => {
                const active = currentVariant?.id === variant.id;
                const primaryLabel =
                  variant.lengthInches > 0
                    ? `${variant.lengthInches}" · ${variant.colorShade}`
                    : variant.colorShade;

                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => {
                      setSelectedVariant(variant);
                      setQuantity(1);
                    }}
                    className={`min-h-[56px] rounded-2xl border p-3.5 text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                        : 'border-[var(--line)] hover:border-[var(--line-2)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-num text-sm font-medium text-[var(--ink)]">
                        {primaryLabel}
                      </span>
                      <span className="font-mono-num text-xs text-[var(--champagne)] shrink-0">
                        {formatNaira(variant.priceNgn)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted)]">
                      <span className="truncate">{variant.laceType}</span>
                      <span className="shrink-0 ml-2">
                        {variant.availableStock > 0 ? `${variant.availableStock} left` : 'Sold out'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-7 flex flex-col min-[380px]:flex-row items-stretch min-[380px]:items-center gap-3">
            <div className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--line-2)] px-1 self-start min-[380px]:self-auto">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] cursor-pointer"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-mono-num text-sm">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(Math.max(1, stockCount), q + 1))}
                aria-label="Increase quantity"
                disabled={quantity >= stockCount}
                className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] disabled:opacity-40 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={stockCount <= 0}
              className="flex-1 min-h-[48px] rounded-full bg-[var(--accent)] px-6 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
            >
              {stockCount > 0 ? 'Add to Bag' : 'Currently Sold Out'}
            </button>
          </div>

          <div className="mt-8 space-y-3 border-t border-[var(--line)] pt-5 text-xs text-[var(--muted)]">
            <div className="flex items-start gap-3">
              <Truck className="h-4 w-4 shrink-0 text-[var(--champagne)] mt-0.5" />
              <span>
                Same-day Port Harcourt &amp; Obio-Akpor dispatch in Rivers State; 1–4 business days across Nigeria.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--ok)] mt-0.5" />
              <span>
                Protected by our {settings?.returnWindowHours || 48}-hour post-delivery inspection &amp; return window.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
