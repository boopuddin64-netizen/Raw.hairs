import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { ProductCard } from '../components/ProductCard.tsx';
import { formatNaira } from '../types.ts';

type ShopPillar = 'all' | 'hair' | 'care' | 'tools';

export function ShopPage({ initialCategory }: { initialCategory?: string }) {
  const { products, categories, loadingCatalog, catalogError, refreshCatalog } = useStore();
  const [search, setSearch] = useState('');
  const [pillar, setPillar] = useState<ShopPillar>(() => {
    if (initialCategory === 'hair-care') return 'care';
    if (initialCategory === 'styling-tools') return 'tools';
    return 'all';
  });
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || 'all');
  const [selectedLength, setSelectedLength] = useState<number | 'all'>('all');
  const [maxPrice, setMaxPrice] = useState<number>(300000);
  const [inStockOnly, setInStockOnly] = useState(false);

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(initialCategory);
      if (initialCategory === 'hair-care') setPillar('care');
      else if (initialCategory === 'styling-tools') setPillar('tools');
      else setPillar('hair');
    }
  }, [initialCategory]);

  const availableLengths = useMemo(() => {
    const set = new Set<number>();
    products.forEach((p) =>
      p.variants.forEach((v) => {
        if (v.lengthInches > 0) set.add(v.lengthInches);
      }),
    );
    return Array.from(set).sort((a, b) => a - b);
  }, [products]);

  const handlePillarChange = (next: ShopPillar) => {
    setPillar(next);
    setSelectedLength('all');
    if (next === 'all') setSelectedCategory('all');
    else if (next === 'care') setSelectedCategory('hair-care');
    else if (next === 'tools') setSelectedCategory('styling-tools');
    else if (selectedCategory === 'hair-care' || selectedCategory === 'styling-tools') {
      setSelectedCategory('all');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (pillar === 'hair' && ['hair-care', 'styling-tools'].includes(p.categorySlug)) return false;
      if (pillar === 'care' && p.categorySlug !== 'hair-care') return false;
      if (pillar === 'tools' && p.categorySlug !== 'styling-tools') return false;
      if (selectedCategory !== 'all' && p.categorySlug !== selectedCategory) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.texture.toLowerCase().includes(q) &&
        !p.description.toLowerCase().includes(q)
      ) {
        return false;
      }

      const matchingVariants = p.variants.filter((v) => {
        if (selectedLength !== 'all' && v.lengthInches !== selectedLength) return false;
        if (v.priceNgn > maxPrice) return false;
        if (inStockOnly && v.availableStock <= 0) return false;
        return true;
      });

      if (p.variants.length > 0 && matchingVariants.length === 0) return false;
      return true;
    });
  }, [inStockOnly, maxPrice, pillar, products, search, selectedCategory, selectedLength]);

  const hairCategories = categories.filter((c) => !['hair-care', 'styling-tools'].includes(c.slug));

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-5 py-6 sm:py-10">
      <div className="border-b border-[var(--line)] pb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">The Raw.hairs Boutique</p>
        <h1 className="mt-1 font-display text-3xl sm:text-5xl font-medium">
          Hair, Care &amp; Styling Tools
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">
          Browse virgin bundles and HD lace units alongside silk hair care elixirs, titanium straighteners, ceramic curlers, and cordless clippers.
        </p>

        {/* Primary Pillar Switcher */}
        <div className="mt-5 sm:mt-6 flex md:inline-flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5">
          {[
            { id: 'all', label: 'Everything', short: 'Everything' },
            { id: 'hair', label: 'Raw Hair & Wigs', short: 'Hair & Wigs' },
            { id: 'care', label: 'Hair Care & Elixirs', short: 'Hair Care' },
            { id: 'tools', label: 'Straighteners, Curlers & Clippers', short: 'Tools & Clippers' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handlePillarChange(tab.id as ShopPillar)}
              className={`min-h-[40px] shrink-0 rounded-xl px-3.5 sm:px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                pillar === tab.id
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                  : 'text-[var(--soft)] hover:text-[var(--ink)]'
              }`}
            >
              <span className="sm:hidden">{tab.short}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter Controls */}
      <div className="mt-5 sm:mt-6 space-y-4">
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto] items-center">
          <div className="relative sm:col-span-2 md:col-span-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hair, serum, straightener, curler..."
              className="h-11 w-full rounded-full border border-[var(--line-2)] bg-[var(--surface)] pl-11 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-3 rounded-full border border-[var(--line-2)] bg-[var(--surface)] px-4 sm:px-5 h-11">
            <label htmlFor="price-cap" className="text-xs text-[var(--muted)] whitespace-nowrap">
              Max: <span className="font-mono-num text-[var(--ink)]">{formatNaira(maxPrice)}</span>
            </label>
            <input
              id="price-cap"
              type="range"
              min={30000}
              max={300000}
              step={10000}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-28 sm:w-28 flex-1 max-w-[140px] accent-[var(--accent)]"
            />
          </div>

          <button
            type="button"
            onClick={() => setInStockOnly((v) => !v)}
            className={`h-11 rounded-full border px-5 text-xs font-medium uppercase tracking-[0.1em] whitespace-nowrap cursor-pointer transition-colors ${
              inStockOnly
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]'
                : 'border-[var(--line-2)] bg-[var(--surface)] text-[var(--ink)]'
            }`}
          >
            {inStockOnly ? 'In Stock Only: On' : 'In Stock Only'}
          </button>
        </div>

        {(pillar === 'all' || pillar === 'hair') && (
          <>
            <div className="flex overflow-x-auto no-scrollbar sm:flex-wrap gap-2 pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`min-h-[38px] shrink-0 rounded-full px-4 py-2 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]'
                    : 'border-[var(--line)] bg-[var(--surface)] text-[var(--soft)] hover:text-[var(--ink)]'
                }`}
              >
                All Textures
              </button>
              {hairCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setPillar('hair');
                    setSelectedCategory(cat.slug);
                  }}
                  className={`min-h-[38px] shrink-0 rounded-full px-4 py-2 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat.slug
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="flex overflow-x-auto no-scrollbar sm:flex-wrap items-center gap-2 text-xs pb-1">
              <span className="text-[var(--muted)] mr-1 shrink-0">Length:</span>
              <button
                type="button"
                onClick={() => setSelectedLength('all')}
                className={`min-h-[36px] shrink-0 rounded-full px-3.5 py-1.5 border cursor-pointer ${
                  selectedLength === 'all'
                    ? 'border-[var(--champagne)] text-[var(--champagne)]'
                    : 'border-[var(--line)] text-[var(--muted)]'
                }`}
              >
                All
              </button>
              {availableLengths.map((len) => (
                <button
                  key={len}
                  type="button"
                  onClick={() => setSelectedLength(len)}
                  className={`min-h-[36px] shrink-0 rounded-full px-3.5 py-1.5 border font-mono-num cursor-pointer ${
                    selectedLength === len
                      ? 'border-[var(--champagne)] text-[var(--champagne)]'
                      : 'border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  {len}&quot;
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Results */}
      <div className="mt-8">
        {catalogError && (
          <div className="rounded-2xl border border-[var(--bad)] bg-[var(--surface)] p-5 text-sm">
            <p className="text-[var(--bad)]">{catalogError}</p>
            <button
              type="button"
              onClick={() => void refreshCatalog()}
              className="mt-3 rounded-full border border-[var(--line-2)] px-5 py-2 text-xs uppercase tracking-[0.1em] cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {loadingCatalog ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="h-80 rounded-2xl border border-[var(--line)] bg-[var(--surface)] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-12 text-center">
            <h2 className="font-display text-2xl">No matching pieces found</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Try clearing your search or switching category tabs.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPillar('all');
                setSelectedCategory('all');
                setSelectedLength('all');
                setMaxPrice(300000);
                setInStockOnly(false);
              }}
              className="mt-5 rounded-full bg-[var(--accent)] px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)] cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
