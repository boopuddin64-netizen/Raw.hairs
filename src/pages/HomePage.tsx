import { ArrowRight } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { ProductCard } from '../components/ProductCard.tsx';
import { SafeImage } from '../components/SafeImage.tsx';

export function HomePage() {
  const { navigate, products, loadingCatalog } = useStore();

  const featuredProducts = products.filter((p) => p.featured).slice(0, 6);
  const collectionSlice = featuredProducts.length > 0 ? featuredProducts : products.slice(0, 6);

  const pillars = [
    {
      title: 'Virgin Hair & Lace Units',
      subtitle: 'Bone Straight, Body Wave, Curly & HD Lace',
      image: '/catalogue/bone.jpg',
      category: 'bone-straight',
    },
    {
      title: 'Silk Hair Care & Elixirs',
      subtitle: 'Keratin Serums, Lace Melt Mists & Masques',
      image: '/src/assets/images/care_silk_elixir_1795590466182.jpg',
      category: 'hair-care',
    },
    {
      title: 'Straighteners, Curlers & Clippers',
      subtitle: '450°F Titanium Irons, Ceramic Wands & Shears',
      image: '/src/assets/images/tool_titanium_straightener_1795590464705.jpg',
      category: 'styling-tools',
    },
  ];

  return (
    <div>
      {/* 1. Feminine Editorial Hero */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-5 pt-4 sm:pt-6 pb-8 sm:pb-12">
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[1.05fr_0.95fr] items-stretch rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-8 lg:p-10">
          <div className="flex flex-col justify-center py-2 sm:py-4 lg:pr-6">
            <p className="text-[11px] sm:text-xs tracking-[0.18em] sm:tracking-[0.22em] uppercase text-[var(--accent)]">
              Raw beauty · Real you · Port Harcourt
            </p>
            <h1 className="mt-3 sm:mt-4 font-display text-[2.25rem] sm:text-5xl lg:text-[3.75rem] font-medium leading-[1.06] text-[var(--ink)]">
              Your crown.
              <br />
              <em className="italic font-normal text-[var(--accent)]">Your confidence.</em>
            </h1>
            <p className="mt-4 sm:mt-5 max-w-lg text-sm sm:text-base text-[var(--soft)] leading-relaxed">
              Single-donor virgin bundles, invisible HD lace units, botanical hair care elixirs, and salon-grade straighteners, curlers, and clippers—dispatched across Rivers State and nationwide.
            </p>

            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={() => navigate({ page: 'shop' })}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-7 py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Shop the Collection</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate({ page: 'services' })}
                className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-[var(--line-2)] px-6 py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink)] hover:border-[var(--accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Book Salon Care
              </button>
            </div>

            <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-[var(--line)] flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--muted)]">
              <span>Same-Day Rivers State Dispatch</span>
              <span aria-hidden="true">·</span>
              <span>48-Hour Return Window</span>
              <span aria-hidden="true">·</span>
              <span>15-Min Stock Reservation</span>
            </div>
          </div>

          <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full min-h-[220px] sm:min-h-[340px] overflow-hidden rounded-2xl bg-[var(--surface-2)]">
            <SafeImage
              src="/catalogue/hero.jpg"
              alt="Raw.hairs single-donor virgin hair collection"
              title="RAW.HAIRS"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* 2. Three Luxury Shopping Worlds */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-5 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 mb-6 sm:mb-7">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Shop by Ritual</p>
            <h2 className="mt-1 font-display text-3xl sm:text-4xl font-medium">Hair, Care &amp; Styling Tools</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate({ page: 'shop' })}
            className="self-start sm:self-auto text-sm text-[var(--soft)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            Explore all categories →
          </button>
        </div>

        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <button
              key={pillar.category}
              type="button"
              onClick={() => navigate({ page: 'shop', category: pillar.category })}
              className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] text-left transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="aspect-[4/3] w-full overflow-hidden">
                <SafeImage
                  src={pillar.image}
                  alt={pillar.title}
                  title={pillar.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-4 sm:p-5">
                <h3 className="font-display text-xl sm:text-2xl font-medium text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
                  {pillar.title}
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">{pillar.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 3. Featured Collection */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-5 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Curated Favorites</p>
            <h2 className="mt-1 font-display text-3xl sm:text-4xl font-medium">Signature Pieces &amp; Tools</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate({ page: 'shop' })}
            className="self-start sm:self-auto text-sm text-[var(--soft)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            View full boutique →
          </button>
        </div>

        {loadingCatalog ? (
          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-80 rounded-2xl border border-[var(--line)] bg-[var(--surface)] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {collectionSlice.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* 4. Studio Care Atelier Band */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-5 pb-12 sm:pb-16 pt-4 sm:pt-6">
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-2 items-stretch rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
          <div className="aspect-[4/3] lg:aspect-auto lg:h-full overflow-hidden rounded-2xl">
            <SafeImage
              src="/catalogue/care.jpg"
              alt="Raw.hairs Port Harcourt salon care studio"
              title="Raw.hairs Studio"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="flex flex-col justify-center p-2 sm:p-6 lg:p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--champagne)]">
              The Raw.hairs Studio · New GRA, Port Harcourt
            </p>
            <h2 className="mt-2 font-display text-2xl sm:text-4xl font-medium">
              Care for every crown. Services, made personal.
            </h2>
            <p className="mt-3 sm:mt-4 text-sm text-[var(--muted)] leading-relaxed">
              Reserve studio time for silk wig revamps, seamless HD frontal installations, or custom balayage toning—or request a tailored USD quote with DHL/FedEx shipping anywhere in the world.
            </p>
            <div className="mt-6 sm:mt-7 flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate({ page: 'services' })}
                className="min-h-[44px] rounded-full bg-[var(--accent)] px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)] hover:opacity-90 cursor-pointer"
              >
                Book Studio Service
              </button>
              <button
                type="button"
                onClick={() => navigate({ page: 'quote' })}
                className="min-h-[44px] rounded-full border border-[var(--line-2)] px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--ink)] hover:border-[var(--accent)] cursor-pointer"
              >
                International Quote
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
