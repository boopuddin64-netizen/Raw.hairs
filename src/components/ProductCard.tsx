import { Plus } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { formatNaira, type Product } from '../types.ts';
import { SafeImage } from './SafeImage.tsx';

export function ProductCard({ product }: { product: Product }) {
  const { navigate, addToCart } = useStore();

  const totalAvailable = product.variants.reduce((sum, v) => sum + v.availableStock, 0);
  const hairLengths = product.variants
    .map((v) => v.lengthInches)
    .filter((len) => len > 0)
    .sort((a, b) => a - b);

  const specLabel =
    hairLengths.length > 1
      ? `${hairLengths[0]}"–${hairLengths[hairLengths.length - 1]}"`
      : hairLengths.length === 1
        ? `${hairLengths[0]}"`
        : product.variants[0]?.laceType.split('·')[0].trim() || 'Edition';

  const minPrice =
    product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.priceNgn))
      : product.basePriceNgn;

  const defaultVariant = product.variants.find((v) => v.availableStock > 0) || product.variants[0];

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!defaultVariant || defaultVariant.availableStock <= 0) {
      navigate({ page: 'product', slug: product.slug });
      return;
    }
    addToCart({
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      imageUrl: product.imageUrl,
      variantId: defaultVariant.id,
      sku: defaultVariant.sku,
      lengthInches: defaultVariant.lengthInches,
      laceType: defaultVariant.laceType,
      priceNgn: defaultVariant.priceNgn,
      quantity: 1,
      maxStock: defaultVariant.availableStock,
    });
  };

  return (
    <article className="group flex flex-col justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2.5 sm:p-3 transition-transform duration-150 hover:-translate-y-0.5 min-w-0">
      <button
        type="button"
        onClick={() => navigate({ page: 'product', slug: product.slug })}
        className="block w-full text-left cursor-pointer"
      >
        <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--surface-2)]">
          <SafeImage
            src={product.imageUrl}
            alt={product.name}
            title={product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>

        <div className="px-1.5 sm:px-2 pt-3.5 sm:pt-4">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-[var(--muted)] truncate">
            <span className="truncate">{product.texture}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums truncate">{specLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0" style={{ color: totalAvailable > 0 ? 'var(--ok)' : 'var(--bad)' }}>
              {totalAvailable > 0 ? `${totalAvailable} ready` : 'Sold out'}
            </span>
          </div>

          <h3 className="mt-1.5 text-base font-medium text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors truncate">
            {product.name}
          </h3>
        </div>
      </button>

      <div className="mt-4 flex items-center justify-between gap-2 px-1.5 sm:px-2 pb-1">
        <span className="text-sm font-mono-num font-medium text-[var(--ink)] truncate">
          {product.variants.length > 1 ? `From ${formatNaira(minPrice)}` : formatNaira(minPrice)}
        </span>

        <button
          type="button"
          onClick={handleQuickAdd}
          disabled={!defaultVariant || defaultVariant.availableStock <= 0}
          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--line-2)] px-3.5 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add</span>
        </button>
      </div>
    </article>
  );
}
