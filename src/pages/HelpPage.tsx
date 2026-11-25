import { useStore } from '../context/StoreContext.tsx';
import { formatNaira } from '../types.ts';

const TOPICS = [
  { id: 'delivery', label: 'Delivery & Shipping' },
  { id: 'returns', label: '48h Returns & Refunds' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'contact', label: 'Contact Studio' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms', label: 'Terms & Conditions' },
];

export function HelpPage({ topic }: { topic?: string }) {
  const { navigate, settings } = useStore();
  const active = topic || 'delivery';

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-5 py-6 sm:py-10">
      <div className="border-b border-[var(--line)] pb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Customer Care</p>
        <h1 className="mt-1 font-display text-3xl sm:text-5xl font-medium">Shop With Confidence</h1>
      </div>

      <div className="mt-5 sm:mt-6 flex overflow-x-auto no-scrollbar sm:flex-wrap gap-2 pb-1">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate({ page: 'help', topic: t.id })}
            className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium border transition-colors cursor-pointer ${
              active === t.id
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--soft)] hover:border-[var(--line-2)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 sm:mt-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8 space-y-5 text-sm text-[var(--soft)] leading-relaxed">
        {active === 'delivery' && (
          <>
            <h2 className="font-display text-2xl sm:text-3xl text-[var(--ink)]">Rivers State &amp; Nationwide Delivery</h2>
            <p>
              Our fulfillment hub is located in Port Harcourt, Rivers State. Orders placed for Port Harcourt Metro and Obio-Akpor qualify for same-day rider dispatch—including virgin hair bundles, hair care elixirs, and salon styling tools.
            </p>
            <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] overflow-hidden">
              {(settings?.riversZones || []).map((z) => (
                <div key={z.id} className="p-4 flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-1 min-[380px]:gap-4">
                  <div>
                    <p className="font-medium text-[var(--ink)]">{z.name}</p>
                    <p className="text-xs text-[var(--muted)]">{z.etaText}</p>
                  </div>
                  <span className="font-mono-num text-[var(--ink)] shrink-0">{formatNaira(z.feeNgn)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {active === 'returns' && (
          <>
            <h2 className="font-display text-3xl text-[var(--ink)]">
              {settings?.returnWindowHours || 48}-Hour Return Policy
            </h2>
            <p>{settings?.returnEligibilityNotes}</p>
            <p>
              Styling tools and hair care products must remain sealed with protective wraps and original studio boxes intact. To submit a return claim within {settings?.returnWindowHours || 48} hours of confirmed delivery, open your Account → Orders tab and upload clear photographic evidence.
            </p>
          </>
        )}

        {active === 'faqs' && (
          <>
            <h2 className="font-display text-3xl text-[var(--ink)]">Frequently Asked Questions</h2>
            <div>
              <h3 className="font-medium text-[var(--ink)]">Is Raw.hairs 100% single-donor virgin hair?</h3>
              <p className="mt-1 text-[var(--muted)]">
                Yes. Every bundle and HD lace unit is ethically sourced, cuticle-aligned, and heat-safe up to 450°F for coloring and silk-pressing.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-[var(--ink)]">Are your straighteners, curlers, and clippers salon-grade?</h3>
              <p className="mt-1 text-[var(--muted)]">
                Yes. Our titanium hair straighteners, tourmaline-ceramic curlers, and cordless trimmers are calibrated for both raw virgin textures and natural hair, with Nigerian 220V–240V compatibility.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-[var(--ink)]">How does the 15-minute checkout reservation work?</h3>
              <p className="mt-1 text-[var(--muted)]">
                When you initiate Paystack checkout, your chosen length, hair care set, or styling tool stock is locked for 15 minutes so another buyer cannot purchase it mid-payment.
              </p>
            </div>
          </>
        )}

        {active === 'contact' && (
          <>
            <h2 className="font-display text-3xl text-[var(--ink)]">Port Harcourt Flagship Studio</h2>
            <p>New GRA, Port Harcourt, Rivers State, Nigeria.</p>
            <p>Instagram: @raw.hairs · Studio Hours: Monday – Saturday, 9:00 AM – 6:30 PM WAT.</p>
          </>
        )}

        {active === 'privacy' && (
          <>
            <h2 className="font-display text-3xl text-[var(--ink)]">Privacy Policy</h2>
            <p>
              Customer contact details, delivery addresses, and order records are used solely to verify payments, dispatch orders, and send requested WhatsApp updates. Dispatch riders only see contact details for deliveries actively assigned to them.
            </p>
          </>
        )}

        {active === 'terms' && (
          <>
            <h2 className="font-display text-3xl text-[var(--ink)]">Terms &amp; Conditions</h2>
            <p>
              All Nigerian orders are verified via Paystack or Direct Bank Transfer (by submitting your transfer receipt and transaction code for Admin confirmation) before dispatch approval. Salon bookings require at least 1 hour advance notice and are confirmed by our Port Harcourt stylist desk.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
