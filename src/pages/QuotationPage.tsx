import React, { useState } from 'react';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { apiRequest } from '../lib/api.ts';
import type { QuotationRecord } from '../types.ts';

export function QuotationPage() {
  const { dbUser, getIdToken, notify, navigate } = useStore();
  const [customerName, setCustomerName] = useState(dbUser?.fullName || '');
  const [customerEmail, setCustomerEmail] = useState(dbUser?.email || '');
  const [customerPhone, setCustomerPhone] = useState(dbUser?.phone || '');
  const [country, setCountry] = useState('United Kingdom');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([
    { productName: 'Atelier Bone Straight Bundles', texture: 'Bone Straight', lengthInches: 20, quantity: 1 },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submittedQuote, setSubmittedQuote] = useState<QuotationRecord | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const token = await getIdToken();
      const res = await apiRequest<{ quotation: QuotationRecord }>('/api/quotations', {
        method: 'POST',
        token,
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerPhone,
          country,
          city,
          postalCode,
          itemsSummary: items,
          notes,
        }),
      });
      setSubmittedQuote(res.quotation);
      notify(`Quotation ${res.quotation.quoteCode} submitted!`, 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit quotation request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-5 py-6 sm:py-10">
      <div className="border-b border-[var(--line)] pb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--champagne)]">
          <Globe className="h-4 w-4 shrink-0" />
          <span>Worldwide DHL &amp; FedEx Express</span>
        </div>
        <h1 className="mt-1 font-display text-3xl sm:text-5xl font-medium">International Quotation</h1>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">
          Shipping virgin bundles, hair care elixirs, or salon styling tools outside Nigeria? Request an itemized USD quotation including tracked express courier fees.
        </p>
      </div>

      {submittedQuote ? (
        <div className="mt-8 rounded-3xl border border-[var(--ok)] bg-[var(--surface)] p-8">
          <p className="text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--ok)' }}>
            Quotation Request Logged · {submittedQuote.quoteCode}
          </p>
          <h2 className="mt-2 font-display text-3xl">We are calculating your DHL/FedEx rate</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Destination: {submittedQuote.city}, {submittedQuote.country}. You will receive a WhatsApp alert when our team publishes your final USD invoice.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate({ page: 'account' })}
              className="rounded-full bg-[var(--accent)] px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)] cursor-pointer"
            >
              View in Account
            </button>
            <button
              type="button"
              onClick={() => setSubmittedQuote(null)}
              className="rounded-full border border-[var(--line-2)] px-6 py-3 text-xs uppercase tracking-[0.12em] cursor-pointer"
            >
              New Request
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8 space-y-6">
          {error && (
            <div className="rounded-2xl border border-[var(--bad)] p-3.5 text-sm text-[var(--bad)]">{error}</div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">Full Name</label>
              <input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">Email</label>
              <input
                type="email"
                required
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">WhatsApp Phone</label>
              <input
                required
                placeholder="+44 / +1 ..."
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">Country</label>
              <input
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">City</label>
              <input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">Postal / ZIP Code</label>
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>
          </div>

          <div className="border-t border-[var(--line)] pt-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Requested Hair, Care &amp; Styling Tools
              </span>
              <button
                type="button"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    { productName: 'Obsidian & Rose Titanium Straightener', texture: 'Styling Tools', lengthInches: 0, quantity: 1 },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line-2)] px-3 py-1 text-xs text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 sm:grid-cols-[1.5fr_1fr_92px_76px_auto] items-center rounded-2xl border border-[var(--line)] bg-[var(--bg)]/40 p-3.5"
                >
                  <div>
                    <label className="sm:hidden block text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] mb-1">
                      Item Name
                    </label>
                    <input
                      required
                      value={item.productName}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].productName = e.target.value;
                        setItems(next);
                      }}
                      placeholder="Product, tool, or custom wig"
                      className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="sm:hidden block text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] mb-1">
                      Texture / Spec
                    </label>
                    <input
                      required
                      value={item.texture}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].texture = e.target.value;
                        setItems(next);
                      }}
                      placeholder="Texture / Spec"
                      className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:contents">
                    <div>
                      <label className="sm:hidden block text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] mb-1">
                        Length (in)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={40}
                        title="Length in inches (use 0 for hair care or styling tools)"
                        value={item.lengthInches}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx].lengthInches = Math.max(0, Number(e.target.value));
                          setItems(next);
                        }}
                        placeholder="In (0=N/A)"
                        className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="sm:hidden block text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={item.quantity}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx].quantity = Math.max(1, Number(e.target.value));
                          setItems(next);
                        }}
                        className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm font-mono-num"
                      />
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove item"
                      className="justify-self-end sm:justify-self-auto p-2.5 text-[var(--muted)] hover:text-[var(--bad)] cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Enter length in inches for hair bundles/wigs, or leave as 0 for hair care elixirs and styling tools.
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
              Additional Styling, Plug Voltage, or Lace Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-2xl border border-[var(--line-2)] bg-[var(--bg)] p-3.5 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full sm:w-auto min-h-[46px] rounded-full bg-[var(--accent)] px-8 py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] hover:opacity-90 cursor-pointer"
          >
            {busy ? 'Submitting Request...' : 'Request International Quote'}
          </button>
        </form>
      )}
    </div>
  );
}
