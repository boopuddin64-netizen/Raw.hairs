import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Copy, Landmark, Lock, Upload } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { formatNaira, type OrderRecord } from '../types.ts';

const NIGERIAN_STATES = [
  'Rivers',
  'Bayelsa',
  'Akwa Ibom',
  'Delta',
  'Abia',
  'Imo',
  'Enugu',
  'Anambra',
  'Cross River',
  'Edo',
  'Lagos',
  'FCT Abuja',
  'Ogun',
  'Oyo',
  'Kano',
  'Kaduna',
  'Other',
];

export function CheckoutPage({ payRef }: { payRef?: string }) {
  const {
    cart,
    cartSubtotalNgn,
    clearCart,
    settings,
    dbUser,
    getIdToken,
    navigate,
    notify,
    refreshCatalog,
  } = useStore();

  const [name, setName] = useState(dbUser?.fullName || '');
  const [email, setEmail] = useState(dbUser?.email || '');
  const [phone, setPhone] = useState(dbUser?.phone || '');
  const [state, setState] = useState(dbUser?.defaultState || 'Rivers');
  const [zoneId, setZoneId] = useState(dbUser?.defaultZone || 'ph-gra');
  const [city, setCity] = useState('Port Harcourt');
  const [address, setAddress] = useState(dbUser?.defaultAddress || '');
  const [instructions, setInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'bank_transfer'>('paystack');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reservedOrder, setReservedOrder] = useState<OrderRecord | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [confirmedOrder, setConfirmedOrder] = useState<OrderRecord | null>(null);

  // Direct Bank Transfer proof state
  const [transactionCode, setTransactionCode] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');

  useEffect(() => {
    if (dbUser) {
      setName((prev) => prev || dbUser.fullName || '');
      setEmail((prev) => prev || dbUser.email || '');
      setPhone((prev) => prev || dbUser.phone || '');
      if (dbUser.defaultAddress) setAddress((prev) => prev || dbUser.defaultAddress || '');
    }
  }, [dbUser]);

  useEffect(() => {
    if (!payRef || confirmedOrder) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await apiRequest<{ ok: boolean; order: OrderRecord }>('/api/paystack/verify', {
          method: 'POST',
          body: JSON.stringify({ reference: payRef }),
        });
        if (!cancelled) {
          setConfirmedOrder(res.order);
          clearCart();
          void refreshCatalog();
          window.history.replaceState({}, '', `${window.location.pathname}#/checkout`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to verify Paystack transaction.');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearCart, confirmedOrder, payRef, refreshCatalog]);

  useEffect(() => {
    if (!expiresAt || confirmedOrder) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [confirmedOrder, expiresAt]);

  const riversZones = settings?.riversZones || [];
  const interstateZones = settings?.interstateZones || [];

  const deliveryCalc = useMemo(() => {
    if (state === 'Rivers') {
      const z = riversZones.find((r) => r.id === zoneId) || riversZones[0];
      return {
        feeNgn: z?.feeNgn ?? 2500,
        eta: z?.etaText ?? 'Same Day',
      };
    }
    const inter =
      interstateZones.find((z) => z.states.some((s) => s.toLowerCase() === state.toLowerCase())) ||
      interstateZones[interstateZones.length - 1];
    return {
      feeNgn: inter?.feeNgn ?? 6500,
      eta: inter?.etaText ?? '2–3 Business Days',
    };
  }, [interstateZones, riversZones, state, zoneId]);

  const totalNgn = cartSubtotalNgn + deliveryCalc.feeNgn;
  const bankTransferEnabled = settings?.bankTransferEnabled ?? true;

  useEffect(() => {
    if (!bankTransferEnabled && paymentMethod === 'bank_transfer') {
      setPaymentMethod('paystack');
    }
  }, [bankTransferEnabled, paymentMethod]);

  const handleReserveAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const token = await getIdToken();
      const res = await apiRequest<{
        order: OrderRecord;
        expiresAt: string;
      }>('/api/checkout/reserve', {
        method: 'POST',
        token,
        body: JSON.stringify({
          items: cart.map((c) => ({ variantId: c.variantId, quantity: c.quantity })),
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          state,
          deliveryZone: state === 'Rivers' ? zoneId : state,
          city,
          address,
          instructions,
          paymentMethod,
        }),
      });

      setReservedOrder(res.order);
      setExpiresAt(new Date(res.expiresAt).getTime());
      notify(
        res.order.paymentMethod === 'bank_transfer'
          ? 'Stock held for 30 minutes. Transfer total & submit your receipt + transaction code.'
          : 'Stock reserved for 15 minutes. Complete Paystack payment below.',
        'info',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reserve stock.');
    } finally {
      setBusy(false);
    }
  };

  const handleCompletePaystack = async () => {
    if (!reservedOrder?.paystackReference) return;
    setError('');
    setBusy(true);
    try {
      const initRes = await apiRequest<{
        mode: 'live' | 'test_simulation';
        authorizationUrl?: string;
        reference: string;
      }>('/api/paystack/initialize', {
        method: 'POST',
        body: JSON.stringify({ reference: reservedOrder.paystackReference }),
      });

      if (initRes.mode === 'live' && initRes.authorizationUrl) {
        window.location.href = initRes.authorizationUrl;
        return;
      }

      const verifyRes = await apiRequest<{ ok: boolean; order: OrderRecord }>('/api/paystack/verify', {
        method: 'POST',
        body: JSON.stringify({ reference: reservedOrder.paystackReference }),
      });

      setConfirmedOrder(verifyRes.order);
      clearCart();
      void refreshCatalog();
      notify(`Payment verified for ${verifyRes.order.orderNumber}!`, 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setError('Please upload a PNG, JPG, or WebP screenshot of your transfer receipt.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('Receipt image must be smaller than 3MB.');
      return;
    }
    setError('');
    setReceiptFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReceiptImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitBankTransferProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservedOrder) return;
    setError('');
    setBusy(true);
    try {
      const token = await getIdToken();
      const res = await apiRequest<{ ok: boolean; order: OrderRecord }>(
        `/api/orders/${encodeURIComponent(reservedOrder.orderNumber)}/bank-transfer-proof`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            customerEmail: email || reservedOrder.customerEmail,
            transactionCode,
            receiptImage,
          }),
        },
      );
      setConfirmedOrder(res.order);
      clearCart();
      void refreshCatalog();
      notify(`Transfer receipt & code submitted to Admin for ${res.order.orderNumber}!`, 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit transfer proof.');
    } finally {
      setBusy(false);
    }
  };

  const copyAccountNumber = () => {
    const acct = settings?.bankAccountNumber || '5401928374';
    navigator.clipboard?.writeText(acct);
    notify(`Copied account number ${acct}`, 'ok');
  };

  if (confirmedOrder) {
    const isTransferPending = confirmedOrder.status === 'awaiting_transfer_confirmation';
    return (
      <div className="mx-auto max-w-2xl px-5 py-14">
        <div className="rounded-3xl border border-[var(--ok)] bg-[var(--surface)] p-8">
          <div className="flex items-center gap-3" style={{ color: isTransferPending ? 'var(--champagne)' : 'var(--ok)' }}>
            <CheckCircle2 className="h-6 w-6" />
            <span className="text-xs uppercase tracking-[0.16em]">
              {isTransferPending ? 'Transfer Proof Sent to Admin' : 'Order Confirmed'}
            </span>
          </div>
          <h1 className="mt-3 font-display text-4xl font-medium">Thank you, {confirmedOrder.customerName}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Reference <strong className="font-mono-num text-[var(--ink)]">{confirmedOrder.orderNumber}</strong> · Status:{' '}
            <span className="uppercase font-medium text-[var(--accent)]">
              {confirmedOrder.status.replace(/_/g, ' ')}
            </span>
          </p>

          {isTransferPending && (
            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-xs text-[var(--soft)] leading-relaxed">
              Your receipt and transaction code (
              <strong className="font-mono-num text-[var(--ink)]">{confirmedOrder.bankTransactionCode}</strong>) are with our Admin Desk. Your items remain reserved while we confirm your transfer and approve dispatch.
            </div>
          )}

          <div className="mt-6 border-t border-[var(--line)] pt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Destination</span>
              <span>{confirmedOrder.deliveryZone}, {confirmedOrder.state}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Subtotal</span>
              <span className="font-mono-num">{formatNaira(confirmedOrder.subtotalNgn)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Delivery Fee</span>
              <span className="font-mono-num">{formatNaira(confirmedOrder.deliveryFeeNgn)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--line)] pt-2 font-medium text-base">
              <span>Total</span>
              <span className="font-mono-num">{formatNaira(confirmedOrder.totalNgn)}</span>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate({ page: 'track' })}
              className="rounded-full bg-[var(--accent)] px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] cursor-pointer"
            >
              Track Order Status
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'shop' })}
              className="rounded-full border border-[var(--line-2)] px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] cursor-pointer"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0 && !reservedOrder) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="font-display text-4xl">Your bag is empty</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Add hair, care elixirs, or styling tools before checking out.</p>
        <button
          type="button"
          onClick={() => navigate({ page: 'shop' })}
          className="mt-6 rounded-full bg-[var(--accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] cursor-pointer"
        >
          Browse Boutique
        </button>
      </div>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-5 py-6 sm:py-10">
      <div className="border-b border-[var(--line)] pb-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
          Rivers State &amp; Nationwide Nigerian Checkout
        </p>
        <h1 className="mt-1 font-display text-3xl sm:text-4xl font-medium">Complete Your Order</h1>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-[var(--bad)] bg-[var(--surface)] p-4 text-sm text-[var(--bad)]">
          {error}
        </div>
      )}

      <div className="mt-6 sm:mt-8 grid gap-6 sm:gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
        {reservedOrder ? (
          reservedOrder.paymentMethod === 'bank_transfer' ? (
            <form
              onSubmit={handleSubmitBankTransferProof}
              className="rounded-3xl border border-[var(--champagne)] bg-[var(--surface)] p-5 sm:p-8 space-y-6 min-w-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-4">
                <div className="flex items-center gap-2 text-[var(--champagne)]">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span className="text-xs uppercase tracking-[0.14em]">30-Minute Transfer Hold Active</span>
                </div>
                <span className="font-mono-num text-lg font-medium text-[var(--ink)]">
                  {mm}:{ss}
                </span>
              </div>

              <div>
                <h2 className="font-display text-2xl sm:text-3xl">Direct Bank Transfer · {reservedOrder.orderNumber}</h2>
                <p className="mt-1.5 text-sm text-[var(--muted)]">
                  {settings?.bankTransferInstructions ||
                    'Transfer the exact total below using your order reference as narration, then upload your receipt and transaction code for Admin confirmation.'}
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4 sm:p-5 space-y-3 text-sm">
                <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-1 min-[380px]:gap-4">
                  <span className="text-[var(--muted)]">Bank Name</span>
                  <span className="font-medium text-[var(--ink)]">{settings?.bankName || 'Providus Bank'}</span>
                </div>
                <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-1 min-[380px]:gap-4">
                  <span className="text-[var(--muted)]">Account Number</span>
                  <button
                    type="button"
                    onClick={copyAccountNumber}
                    className="inline-flex items-center gap-2 font-mono-num text-base font-medium text-[var(--accent)] hover:opacity-80 cursor-pointer self-start min-[380px]:self-auto"
                  >
                    <span>{settings?.bankAccountNumber || '5401928374'}</span>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-1 min-[380px]:gap-4">
                  <span className="text-[var(--muted)]">Account Name</span>
                  <span className="font-medium text-[var(--ink)] min-[380px]:text-right">
                    {settings?.bankAccountName || 'Raw.hairs Studio Port Harcourt'}
                  </span>
                </div>
                <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-1 min-[380px]:gap-4 border-t border-[var(--line)] pt-3">
                  <span className="text-[var(--muted)]">Amount &amp; Narration</span>
                  <span className="font-mono-num font-medium text-[var(--ink)]">
                    {formatNaira(reservedOrder.totalNgn)} · {reservedOrder.orderNumber}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                    Bank Transaction Code / Session ID
                  </label>
                  <input
                    required
                    minLength={4}
                    placeholder="e.g. 000014251124093218 or NIP Ref"
                    value={transactionCode}
                    onChange={(e) => setTransactionCode(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm font-mono-num"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                    Transfer Receipt Screenshot (Required)
                  </label>
                  <label className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--line-2)] bg-[var(--bg)]/50 p-4 text-xs text-[var(--soft)] hover:border-[var(--accent)] cursor-pointer">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <Upload className="h-4 w-4 text-[var(--accent)] shrink-0" />
                      <span className="truncate">
                        {receiptFileName
                          ? `${receiptFileName} (Ready to send)`
                          : 'Upload PNG, JPG, or WebP receipt (max 3MB)'}
                      </span>
                    </span>
                    <span className="self-start sm:self-auto shrink-0 rounded-full border border-[var(--line-2)] px-3 py-1.5 text-[11px] uppercase">
                      Choose File
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleReceiptSelect}
                      className="hidden"
                    />
                  </label>

                  {receiptImage && (
                    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                      <img
                        src={receiptImage}
                        alt="Uploaded transfer receipt preview"
                        className="h-16 w-16 rounded-xl object-cover border border-[var(--line)] shrink-0"
                      />
                      <div className="text-xs text-[var(--muted)] min-w-0">
                        <p className="font-medium text-[var(--ink)]">Receipt Attached</p>
                        <p>Will be inspected by our Port Harcourt Admin Desk</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={busy || !receiptImage || transactionCode.trim().length < 4}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-7 py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  <Landmark className="h-4 w-4" />
                  <span>{busy ? 'Submitting to Admin...' : 'Submit Receipt & Code to Admin'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReservedOrder(null);
                    setExpiresAt(null);
                  }}
                  className="rounded-full border border-[var(--line-2)] px-6 py-3.5 text-xs uppercase tracking-[0.12em] cursor-pointer"
                >
                  Edit Details
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-3xl border border-[var(--champagne)] bg-[var(--surface)] p-6 sm:p-8">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
                <div className="flex items-center gap-2 text-[var(--champagne)]">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-[0.14em]">15-Minute Stock Hold Active</span>
                </div>
                <span className="font-mono-num text-lg font-medium text-[var(--ink)]">
                  {mm}:{ss}
                </span>
              </div>

              <h2 className="mt-5 font-display text-3xl">Order {reservedOrder.orderNumber}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Your items are locked exclusively for you until the countdown expires. Complete Paystack verification below to commit your order.
              </p>

              <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Paystack Reference</span>
                  <span className="font-mono-num">{reservedOrder.paystackReference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Total Due</span>
                  <span className="font-mono-num font-medium">{formatNaira(reservedOrder.totalNgn)}</span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy || secondsLeft === 0}
                  onClick={handleCompletePaystack}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-7 py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  <Lock className="h-4 w-4" />
                  <span>{busy ? 'Verifying with Server...' : `Pay ${formatNaira(reservedOrder.totalNgn)} via Paystack`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReservedOrder(null);
                    setExpiresAt(null);
                  }}
                  className="rounded-full border border-[var(--line-2)] px-6 py-3.5 text-xs uppercase tracking-[0.12em] cursor-pointer"
                >
                  Edit Details
                </button>
              </div>
            </div>
          )
        ) : (
          <form onSubmit={handleReserveAndStart} className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8 space-y-5">
            <h2 className="font-display text-2xl">1. Contact &amp; Rivers State Delivery</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">Full Name</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">WhatsApp Phone</label>
                <input
                  required
                  placeholder="+234 80..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
                >
                  {NIGERIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s} {s === 'Rivers' ? '(Home Hub)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {state === 'Rivers' ? (
              <div>
                <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                  Rivers State Delivery Zone
                </label>
                <select
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
                >
                  {riversZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} — {formatNaira(z.feeNgn)} ({z.etaText})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">City / Town</label>
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                Street Address &amp; Landmark
              </label>
              <input
                required
                placeholder="e.g. Plot 14 Tombia Extension, New GRA, Port Harcourt"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                Delivery Note (Optional)
              </label>
              <input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Gate code, call on arrival, etc."
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>

            <div className="pt-2 border-t border-[var(--line)]">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-3">2. Payment Method</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('paystack')}
                  className={`rounded-2xl border p-4 text-left cursor-pointer ${
                    paymentMethod === 'paystack'
                      ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                      : 'border-[var(--line)]'
                  }`}
                >
                  <p className="text-sm font-medium">Paystack (Card / USSD)</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Instant automated verification &amp; 15-min stock hold</p>
                </button>

                <button
                  type="button"
                  disabled={!bankTransferEnabled}
                  onClick={() => bankTransferEnabled && setPaymentMethod('bank_transfer')}
                  className={`rounded-2xl border p-4 text-left ${
                    !bankTransferEnabled
                      ? 'border-[var(--line)] opacity-45 cursor-not-allowed'
                      : paymentMethod === 'bank_transfer'
                        ? 'border-[var(--accent)] bg-[var(--surface-2)] cursor-pointer'
                        : 'border-[var(--line)] cursor-pointer'
                  }`}
                >
                  <p className="text-sm font-medium">Direct Bank Transfer</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {bankTransferEnabled
                      ? 'Upload receipt & transaction code for Admin confirmation'
                      : 'Temporarily paused by studio'}
                  </p>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[48px] rounded-full bg-[var(--accent)] py-4 px-5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {busy
                ? 'Locking Inventory...'
                : paymentMethod === 'bank_transfer'
                  ? `Reserve Stock & Get Bank Details (${formatNaira(totalNgn)})`
                  : `Reserve Stock & Continue (${formatNaira(totalNgn)})`}
            </button>
          </form>
        )}

        <aside className="order-first lg:order-last rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 lg:sticky lg:top-24">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
            <h2 className="font-display text-2xl">Bag Summary</h2>
            <span className="font-mono-num text-sm font-medium text-[var(--accent)] lg:hidden">
              {formatNaira(totalNgn)}
            </span>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {cart.map((line) => (
              <div key={line.variantId} className="py-3 flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--ink)] truncate">{line.productName}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {line.lengthInches > 0 ? `${line.lengthInches}" · ` : ''}
                    {line.laceType} · Qty {line.quantity}
                  </p>
                </div>
                <span className="font-mono-num shrink-0">{formatNaira(line.priceNgn * line.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-[var(--line)] pt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">Subtotal</span>
              <span className="font-mono-num">{formatNaira(cartSubtotalNgn)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">Delivery ({deliveryCalc.eta})</span>
              <span className="font-mono-num">{formatNaira(deliveryCalc.feeNgn)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--line)] pt-3 text-base font-medium">
              <span>Total</span>
              <span className="font-mono-num">{formatNaira(totalNgn)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
