import React, { useCallback, useEffect, useState } from 'react';
import { LogOut, Shield, Truck, Upload } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { apiRequest } from '../lib/api.ts';
import {
  formatNaira,
  type BookingRecord,
  type OrderRecord,
  type QuotationRecord,
  type ReturnRecord,
} from '../types.ts';

interface AccountSummary {
  orders: OrderRecord[];
  bookings: BookingRecord[];
  quotations: QuotationRecord[];
  returns: ReturnRecord[];
}

export function AccountPage() {
  const {
    firebaseUser,
    dbUser,
    authReady,
    signInWithGoogle,
    signOutUser,
    getIdToken,
    refreshDbUser,
    settings,
    navigate,
    notify,
  } = useStore();

  const [tab, setTab] = useState<'orders' | 'bookings' | 'quotes' | 'returns' | 'profile'>('orders');
  const [summary, setSummary] = useState<AccountSummary>({
    orders: [],
    bookings: [],
    quotations: [],
    returns: [],
  });
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultZone, setDefaultZone] = useState('ph-gra');
  const [defaultAddress, setDefaultAddress] = useState('');

  const [returnOrder, setReturnOrder] = useState<OrderRecord | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [checklist, setChecklist] = useState<string[]>(['Unworn & original ties intact']);
  const [evidencePhotos, setEvidencePhotos] = useState<string[]>([]);
  const [submittingReturn, setSubmittingReturn] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const data = await apiRequest<AccountSummary>('/api/account/summary', { token });
      setSummary(data);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load account summary.', 'error');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, getIdToken, notify]);

  useEffect(() => {
    if (dbUser) {
      setFullName(dbUser.fullName || '');
      setPhone(dbUser.phone || '');
      setDefaultZone(dbUser.defaultZone || 'ph-gra');
      setDefaultAddress(dbUser.defaultAddress || '');
      void loadSummary();
    }
  }, [dbUser, loadSummary]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await getIdToken();
      await apiRequest('/api/auth/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          fullName,
          phone,
          defaultState: 'Rivers',
          defaultZone,
          defaultAddress,
        }),
      });
      await refreshDbUser();
      notify('Profile preferences saved.', 'ok');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to save profile.', 'error');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setEvidencePhotos((prev) => [...prev.slice(0, 2), reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnOrder) return;
    setSubmittingReturn(true);
    try {
      const token = await getIdToken();
      await apiRequest('/api/returns', {
        method: 'POST',
        token,
        body: JSON.stringify({
          orderNumber: returnOrder.orderNumber,
          customerEmail: returnOrder.customerEmail,
          customerPhone: returnOrder.customerPhone,
          reason: returnReason,
          conditionChecklist: checklist,
          evidencePhotos,
        }),
      });
      notify('48-hour return claim submitted.', 'ok');
      setReturnOrder(null);
      setReturnReason('');
      setEvidencePhotos([]);
      await loadSummary();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Return submission failed.', 'error');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const handleQuoteRespond = async (id: number, action: 'accept' | 'decline' | 'pay') => {
    try {
      const token = await getIdToken();
      await apiRequest(`/api/quotations/${id}/respond`, {
        method: 'POST',
        token,
        body: JSON.stringify({ action }),
      });
      notify(`Quotation updated (${action}).`, 'ok');
      await loadSummary();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update quotation.', 'error');
    }
  };

  if (!authReady) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-16">
        <div className="h-48 rounded-3xl border border-[var(--line)] bg-[var(--surface)] animate-pulse" />
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 sm:p-10 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Raw.hairs Member Hub</p>
          <h1 className="mt-2 font-display text-4xl font-medium">Sign In to Your Account</h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            View orders, file 48-hour return claims, manage Port Harcourt salon bookings, and respond to international quotes.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="mt-7 w-full rounded-full bg-[var(--accent)] py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] hover:opacity-90 cursor-pointer"
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-5 py-6 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--line)] pb-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Customer Hub</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl font-medium truncate">
            {dbUser?.fullName || firebaseUser.displayName || firebaseUser.email}
          </h1>
          <p className="mt-1 text-xs text-[var(--muted)] truncate">{firebaseUser.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dbUser && ['dispatch', 'owneradmin'].includes(dbUser.role) && (
            <button
              type="button"
              onClick={() => navigate({ page: 'dispatch' })}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[var(--accent)] px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] text-[var(--accent)] cursor-pointer"
            >
              <Truck className="h-3.5 w-3.5" />
              <span>Dispatch Portal</span>
            </button>
          )}
          {dbUser && ['staff', 'owneradmin'].includes(dbUser.role) && (
            <button
              type="button"
              onClick={() => navigate({ page: 'admin' })}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[var(--champagne)] px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] text-[var(--champagne)] cursor-pointer"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Admin Console</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[var(--line-2)] px-4 py-2 text-xs uppercase tracking-[0.1em] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <div className="mt-5 sm:mt-6 flex overflow-x-auto no-scrollbar sm:flex-wrap gap-2 pb-1">
        {[
          { id: 'orders', label: `Orders (${summary.orders.length})` },
          { id: 'bookings', label: `Bookings (${summary.bookings.length})` },
          { id: 'quotes', label: `Int'l Quotes (${summary.quotations.length})` },
          { id: 'returns', label: `Returns (${summary.returns.length})` },
          { id: 'profile', label: 'Rivers State Profile' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium border transition-colors cursor-pointer ${
              tab === t.id
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--soft)] hover:border-[var(--line-2)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 sm:mt-8">
        {loading && <div className="h-40 rounded-3xl border border-[var(--line)] bg-[var(--surface)] animate-pulse" />}

        {!loading && tab === 'orders' && (
          <div className="space-y-4">
            {summary.orders.length === 0 ? (
              <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)]">
                No orders yet. Explore our signature textures, hair care, and styling tools to place your first order.
              </div>
            ) : (
              summary.orders.map((order) => {
                const deliveredMs = order.deliveredAt ? new Date(order.deliveredAt).getTime() : 0;
                const returnEligible =
                  order.status === 'delivered' &&
                  deliveredMs > 0 &&
                  Date.now() - deliveredMs <= (settings?.returnWindowHours || 48) * 3600 * 1000;

                return (
                  <div key={order.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 border-b border-[var(--line)] pb-4">
                      <div>
                        <span className="font-mono-num text-base font-medium">{order.orderNumber}</span>
                        <span className="block sm:inline sm:ml-3 text-xs text-[var(--muted)]">
                          {new Date(order.createdAt).toLocaleDateString()} · {order.deliveryZone}
                        </span>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 text-xs">
                        <span className="uppercase font-medium text-[var(--accent)]">
                          {order.status.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono-num text-sm font-medium">{formatNaira(order.totalNgn)}</span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-sm text-[var(--soft)]">
                      {(order.items || []).map((item) => (
                        <div key={item.id} className="flex justify-between gap-4">
                          <span>
                            {item.productName} (
                            {item.lengthInches > 0 ? `${item.lengthInches}" · ${item.laceType}` : item.laceType}) ×{' '}
                            {item.quantity}
                          </span>
                          <span className="font-mono-num shrink-0">{formatNaira(item.lineTotalNgn)}</span>
                        </div>
                      ))}
                    </div>

                    {order.paymentMethod === 'bank_transfer' && order.bankTransactionCode && (
                      <div className="mt-3 pt-3 border-t border-[var(--line)] flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
                        <span>
                          Bank Transfer Ref: <strong className="font-mono-num text-[var(--ink)]">{order.bankTransactionCode}</strong>
                        </span>
                        <span className="uppercase" style={{ color: order.paymentStatus === 'paid' ? 'var(--ok)' : 'var(--champagne)' }}>
                          {order.paymentStatus === 'paid' ? 'Confirmed by Admin' : 'Awaiting Admin Confirmation'}
                        </span>
                      </div>
                    )}

                    {returnEligible && (
                      <div className="mt-4 pt-3 border-t border-[var(--line)] flex justify-end">
                        <button
                          type="button"
                          onClick={() => setReturnOrder(order)}
                          className="rounded-full border border-[var(--warn)] px-4 py-2 text-xs uppercase tracking-[0.1em] text-[var(--warn)] cursor-pointer"
                        >
                          Request 48h Return
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {!loading && tab === 'bookings' && (
          <div className="space-y-4">
            {summary.bookings.length === 0 ? (
              <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)]">
                No salon bookings yet.
              </div>
            ) : (
              summary.bookings.map((bk) => (
                <div
                  key={bk.id}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 flex flex-wrap justify-between gap-4"
                >
                  <div>
                    <p className="font-mono-num text-xs text-[var(--muted)]">{bk.bookingCode}</p>
                    <p className="mt-1 font-medium">{bk.serviceName}</p>
                    <p className="text-xs text-[var(--muted)]">{new Date(bk.scheduledAt).toLocaleString()}</p>
                  </div>
                  <span className="text-xs uppercase font-medium text-[var(--accent)] self-center">{bk.status}</span>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && tab === 'quotes' && (
          <div className="space-y-4">
            {summary.quotations.length === 0 ? (
              <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)]">
                No international quotation requests found.
              </div>
            ) : (
              summary.quotations.map((q) => (
                <div key={q.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <span className="font-mono-num text-sm font-medium">{q.quoteCode}</span>
                      <span className="ml-3 text-xs text-[var(--muted)]">
                        {q.city}, {q.country}
                      </span>
                    </div>
                    <span className="text-xs uppercase font-medium text-[var(--champagne)]">{q.status}</span>
                  </div>
                  {q.status === 'quoted' && (
                    <div className="mt-4 border-t border-[var(--line)] pt-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="text-sm font-mono-num">
                        Items ${q.itemsAmountUsd} + Courier ${q.shippingFeeUsd} = <strong>${q.totalUsd} USD</strong>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleQuoteRespond(q.id, 'pay')}
                          className="rounded-full bg-[var(--accent)] px-5 py-2 text-xs uppercase tracking-[0.1em] text-[var(--accent-ink)] cursor-pointer"
                        >
                          Accept &amp; Pay
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleQuoteRespond(q.id, 'decline')}
                          className="rounded-full border border-[var(--line-2)] px-5 py-2 text-xs uppercase tracking-[0.1em] cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {!loading && tab === 'returns' && (
          <div className="space-y-4">
            {summary.returns.length === 0 ? (
              <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)]">
                No return claims submitted.
              </div>
            ) : (
              summary.returns.map((r) => (
                <div key={r.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
                  <div className="flex justify-between">
                    <span className="font-mono-num text-sm font-medium">
                      {r.returnCode} · Order {r.orderNumber}
                    </span>
                    <span className="text-xs uppercase font-medium text-[var(--accent)]">{r.status.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">{r.reason}</p>
                  {r.adminDecisionNote && (
                    <p className="mt-2 text-xs text-[var(--soft)]">Admin Note: {r.adminDecisionNote}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {!loading && tab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="max-w-xl rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8 space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1">Full Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1">WhatsApp Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1">
                Default Rivers State Delivery Zone
              </label>
              <select
                value={defaultZone}
                onChange={(e) => setDefaultZone(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              >
                {(settings?.riversZones || []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1">Default Street Address</label>
              <input
                value={defaultAddress}
                onChange={(e) => setDefaultAddress(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-[var(--accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)] cursor-pointer"
            >
              Save Preferences
            </button>
          </form>
        )}
      </div>

      {returnOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--line-2)] bg-[var(--surface)] p-5 sm:p-7">
            <h2 className="font-display text-2xl">File 48-Hour Return Claim · {returnOrder.orderNumber}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{settings?.returnEligibilityNotes}</p>

            <form onSubmit={handleReturnSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1">Reason for Return</label>
                <textarea
                  required
                  rows={3}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full rounded-2xl border border-[var(--line-2)] bg-[var(--bg)] p-3 text-sm"
                />
              </div>

              <div className="space-y-2 text-xs">
                {[
                  'Unworn & original ties intact',
                  'Lace uncut and free of adhesive/makeup',
                  'Original Raw.hairs packaging & seals included',
                ].map((item) => (
                  <label key={item} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.includes(item)}
                      onChange={(e) =>
                        setChecklist((prev) =>
                          e.target.checked ? [...prev, item] : prev.filter((x) => x !== item),
                        )
                      }
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1">
                  Photo Evidence (Required)
                </label>
                <label className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--line-2)] p-3.5 text-xs text-[var(--muted)] cursor-pointer hover:border-[var(--accent)]">
                  <Upload className="h-4 w-4" />
                  <span>Upload up to 3 clear photos ({evidencePhotos.length} selected)</span>
                  <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnOrder(null)}
                  className="rounded-full border border-[var(--line-2)] px-5 py-2.5 text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn || evidencePhotos.length === 0}
                  className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-xs font-medium uppercase text-[var(--accent-ink)] disabled:opacity-40 cursor-pointer"
                >
                  {submittingReturn ? 'Submitting...' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
