import React, { useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { formatNaira, type OrderItem } from '../types.ts';

interface TrackedOrder {
  order: {
    orderNumber: string;
    state: string;
    deliveryZone: string;
    city: string;
    subtotalNgn: number;
    deliveryFeeNgn: number;
    totalNgn: number;
    paymentMethod: string;
    paymentStatus: string;
    bankTransactionCode?: string | null;
    hasReceipt?: boolean;
    status: string;
    createdAt: string;
  };
  items: OrderItem[];
  deliveryStep: string | null;
}

const STEPS = [
  'pending_payment',
  'awaiting_transfer_confirmation',
  'paid',
  'approved',
  'processing',
  'ready_for_dispatch',
  'out_for_delivery',
  'delivered',
];

export function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrackedOrder | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const code = encodeURIComponent(orderNumber.trim().toUpperCase());
      const q = contact.trim() ? `?contact=${encodeURIComponent(contact.trim())}` : '';
      const data = await apiRequest<TrackedOrder>(`/api/orders/track/${code}${q}`);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Unable to locate order.');
    } finally {
      setBusy(false);
    }
  };

  const currentIdx = result ? STEPS.indexOf(result.order.status) : -1;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-5 py-6 sm:py-10">
      <div className="border-b border-[var(--line)] pb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Live Fulfillment Status</p>
        <h1 className="mt-1 font-display text-3xl sm:text-5xl font-medium">Track Your Order</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Enter your Raw.hairs order reference (for example, <span className="font-mono-num">RH-A1B2C3</span>) and email or WhatsApp phone.
        </p>
      </div>

      <form
        onSubmit={handleLookup}
        className="mt-6 sm:mt-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] items-end"
      >
        <div>
          <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">Order Reference</label>
          <input
            required
            placeholder="RH-XXXXXX"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm font-mono-num uppercase"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">Email or WhatsApp</label>
          <input
            required
            placeholder="you@example.com"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] cursor-pointer"
        >
          <PackageSearch className="h-4 w-4" />
          <span>{busy ? 'Checking...' : 'Track'}</span>
        </button>
      </form>

      {error && (
        <div className="mt-5 rounded-2xl border border-[var(--bad)] bg-[var(--surface)] p-4 text-sm text-[var(--bad)]">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 sm:mt-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 sm:gap-4 border-b border-[var(--line)] pb-4">
            <div>
              <p className="text-xs text-[var(--muted)]">Order Reference</p>
              <h2 className="font-display text-2xl sm:text-3xl font-mono-num">{result.order.orderNumber}</h2>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-[var(--muted)]">Current Stage</p>
              <p className="text-sm font-medium uppercase text-[var(--accent)]">
                {result.order.status.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          {result.order.paymentMethod === 'bank_transfer' && result.order.bankTransactionCode && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-xs flex flex-wrap justify-between gap-2">
              <span className="text-[var(--muted)]">
                Direct Bank Transfer · Code:{' '}
                <strong className="font-mono-num text-[var(--ink)]">{result.order.bankTransactionCode}</strong>
              </span>
              <span className="uppercase font-medium" style={{ color: result.order.paymentStatus === 'paid' ? 'var(--ok)' : 'var(--champagne)' }}>
                {result.order.paymentStatus === 'paid' ? 'Confirmed by Admin' : 'Awaiting Admin Confirmation'}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { id: 'paid', label: 'Payment Verified' },
              { id: 'approved', label: 'Admin Approved' },
              { id: 'out_for_delivery', label: 'Out for Delivery' },
              { id: 'delivered', label: 'Delivered' },
            ].map((step) => {
              const reached = currentIdx >= STEPS.indexOf(step.id);
              return (
                <div
                  key={step.id}
                  className={`rounded-2xl border p-3.5 ${
                    reached ? 'border-[var(--ok)] bg-[var(--surface-2)]' : 'border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  <p className="uppercase tracking-[0.08em]">{step.label}</p>
                  <p className="mt-1 font-medium" style={{ color: reached ? 'var(--ok)' : 'var(--muted)' }}>
                    {reached ? 'Completed' : 'Pending'}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="divide-y divide-[var(--line)] text-sm">
            {result.items.map((item) => (
              <div key={item.id} className="py-3 flex justify-between gap-4">
                <span>
                  {item.productName} (
                  {item.lengthInches > 0 ? `${item.lengthInches}" · ${item.laceType}` : item.laceType}) ×{' '}
                  {item.quantity}
                </span>
                <span className="font-mono-num shrink-0">{formatNaira(item.lineTotalNgn)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-[var(--line)] pt-4 flex justify-between text-sm font-medium">
            <span>Total ({result.order.deliveryZone}, {result.order.state})</span>
            <span className="font-mono-num">{formatNaira(result.order.totalNgn)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
