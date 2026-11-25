import React, { useState } from 'react';
import { CalendarCheck2 } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { formatNaira, type BookingRecord } from '../types.ts';
import { SafeImage } from '../components/SafeImage.tsx';

export function ServicesPage() {
  const { services, dbUser, getIdToken, notify } = useStore();
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [customerName, setCustomerName] = useState(dbUser?.fullName || '');
  const [customerPhone, setCustomerPhone] = useState(dbUser?.phone || '');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState<BookingRecord | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const token = await getIdToken();
      const targetId = selectedServiceId || String(services[0]?.id || '');
      const res = await apiRequest<{ booking: BookingRecord }>('/api/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: Number(targetId),
          customerName,
          customerPhone,
          scheduledAt,
          notes,
        }),
      });
      setConfirmedBooking(res.booking);
      setNotes('');
      setScheduledAt('');
      notify(`Booking request ${res.booking.bookingCode} received`, 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit booking.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-5 py-6 sm:py-10">
      <div className="border-b border-[var(--line)] pb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">The Raw.hairs Studio · Port Harcourt</p>
        <h1 className="mt-1 font-display text-3xl sm:text-5xl font-medium">Salon Care &amp; Services</h1>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">
          Book wig revamps, seamless HD frontal installations, or custom toning. Time slots are verified live against existing studio reservations.
        </p>
      </div>

      <div className="mt-8 sm:mt-10 grid gap-6 sm:gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
        <div className="grid gap-5 sm:grid-cols-2">
          {services.map((svc, idx) => (
            <article key={svc.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                  <span className="font-mono-num">{String(idx + 1).padStart(2, '0')}.</span>
                  <span className="font-mono-num">{svc.durationMinutes} min</span>
                </div>
                <h2 className="mt-3 font-display text-2xl font-medium text-[var(--ink)]">{svc.name}</h2>
                <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{svc.description}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--line)] flex items-center justify-between">
                <span className="font-mono-num text-sm font-medium">
                  {svc.priceNgn ? `From ${formatNaira(svc.priceNgn)}` : 'Price on request'}
                </span>
                <a
                  href="#book-form"
                  onClick={() => setSelectedServiceId(String(svc.id))}
                  className="text-xs uppercase tracking-[0.12em] text-[var(--accent)] hover:underline"
                >
                  Select →
                </a>
              </div>
            </article>
          ))}
        </div>

        <aside className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-3 overflow-hidden">
          <div className="aspect-[4/3] overflow-hidden rounded-2xl">
            <SafeImage
              src="/catalogue/care.jpg"
              alt="Raw.hairs Port Harcourt care studio"
              title="Studio Care"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--champagne)]">New GRA Studio</p>
            <h3 className="mt-2 font-display text-2xl">Booking Guidelines</h3>
            <ul className="mt-3 space-y-2 text-xs text-[var(--muted)]">
              <li>Appointments require at least 1 hour advance notice (up to 90 days ahead).</li>
              <li>Each hourly studio block locks automatically to prevent double-booking.</li>
              <li>Confirmation and studio directions are sent via WhatsApp once approved.</li>
            </ul>
          </div>
        </aside>
      </div>

      <section id="book-form" className="mt-14 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-10">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Request Appointment</p>
          <h2 className="mt-1 font-display text-3xl font-medium">Reserve Your Studio Slot</h2>

          {confirmedBooking && (
            <div className="mt-6 rounded-2xl border border-[var(--ok)] bg-[var(--surface-2)] p-5 text-sm">
              <div className="flex items-center gap-2 font-medium" style={{ color: 'var(--ok)' }}>
                <CalendarCheck2 className="h-4 w-4" />
                <span>Booking Request Received · {confirmedBooking.bookingCode}</span>
              </div>
              <p className="mt-1 text-[var(--soft)]">
                {confirmedBooking.serviceName} for{' '}
                {new Date(confirmedBooking.scheduledAt).toLocaleString()}. Our Port Harcourt team will confirm via WhatsApp.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-2xl border border-[var(--bad)] bg-[var(--surface-2)] p-4 text-sm text-[var(--bad)]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="bk-name" className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                Full Name
              </label>
              <input
                id="bk-name"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="bk-phone" className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                WhatsApp Number
              </label>
              <input
                id="bk-phone"
                required
                placeholder="+234 80..."
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="bk-svc" className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                Service
              </label>
              <select
                id="bk-svc"
                required
                value={selectedServiceId || String(services[0]?.id || '')}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.priceNgn ? `(${formatNaira(s.priceNgn)})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="bk-time" className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                Preferred Date &amp; Time
              </label>
              <input
                id="bk-time"
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="bk-notes" className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1.5">
                Hair Unit Details (Optional)
              </label>
              <textarea
                id="bk-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tell us the unit length, lace condition, or desired color..."
                className="w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] p-3.5 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="w-full sm:w-auto min-h-[46px] rounded-full bg-[var(--accent)] px-7 py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {busy ? 'Checking Studio Availability...' : 'Request Studio Booking'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
