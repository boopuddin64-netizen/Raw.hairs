import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, KeyRound, MapPin, Phone, RefreshCw } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { apiRequest } from '../lib/api.ts';
import type { DeliveryJob } from '../types.ts';

type ProofMode = 'otp_photo' | 'otp' | 'photo' | 'rider_confirm';

const STEP_LABELS: Record<DeliveryJob['step'], string> = {
  assigned: 'Assigned to you',
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  delivered: 'Delivered & confirmed',
};

const PROOF_MODE_LABELS: Record<ProofMode, string> = {
  otp_photo: 'Customer OTP + Rider Photo (Both Required)',
  otp: 'Customer OTP Code',
  photo: 'Rider Photo Proof',
  rider_confirm: 'Rider Confirmation',
};

const NEXT_STEP: Partial<Record<DeliveryJob['step'], DeliveryJob['step']>> = {
  assigned: 'picked_up',
  picked_up: 'on_the_way',
  on_the_way: 'delivered',
};

export function DispatchPage() {
  const { dbUser, authReady, getIdToken, notify, navigate } = useStore();
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [proofMode, setProofMode] = useState<ProofMode>('otp_photo');
  const [loading, setLoading] = useState(true);
  const [proofInput, setProofInput] = useState<Record<number, string>>({});
  const [photoInput, setPhotoInput] = useState<Record<number, string>>({});
  const [issueText, setIssueText] = useState<Record<number, string>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await apiRequest<{
        jobs: DeliveryJob[];
        deliveryProofMode: ProofMode;
      }>('/api/driver/jobs', { token });
      setJobs(res.jobs);
      setProofMode(res.deliveryProofMode || 'otp_photo');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load assigned deliveries.', 'error');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, notify]);

  useEffect(() => {
    if (dbUser && ['dispatch', 'owneradmin'].includes(dbUser.role)) {
      void loadJobs();
    } else {
      setLoading(false);
    }
  }, [dbUser, loadJobs]);

  if (!authReady || loading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-14">
        <div className="h-44 rounded-3xl border border-[var(--line)] bg-[var(--surface)] animate-pulse" />
      </div>
    );
  }

  if (!dbUser || !['dispatch', 'owneradmin'].includes(dbUser.role)) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8">
          <h1 className="font-display text-3xl">Rider Access Required</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This dispatch queue is isolated to verified Rivers State delivery riders.
          </p>
          <button
            type="button"
            onClick={() => navigate({ page: 'account' })}
            className="mt-5 rounded-full bg-[var(--accent)] px-6 py-3 text-xs uppercase tracking-[0.12em] text-[var(--accent-ink)] cursor-pointer"
          >
            Back to Account
          </button>
        </div>
      </div>
    );
  }

  const requiresOtp = proofMode === 'otp_photo' || proofMode === 'otp';
  const requiresPhoto = proofMode === 'otp_photo' || proofMode === 'photo';

  const handleAdvance = async (job: DeliveryJob, nextStep: DeliveryJob['step']) => {
    const enteredOtp = (proofInput[job.id] || '').trim();
    const attachedPhoto = (photoInput[job.id] || '').trim();

    if (nextStep === 'delivered') {
      if (requiresOtp && !/^\d{6}$/.test(enteredOtp)) {
        notify('Please enter the customer’s 6-digit Delivery OTP code.', 'error');
        return;
      }
      if (requiresPhoto && !attachedPhoto) {
        notify('Please attach or capture a delivery confirmation photo.', 'error');
        return;
      }
    }

    setSubmittingId(job.id);
    try {
      const token = await getIdToken();
      await apiRequest(`/api/driver/jobs/${job.id}/transition`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          nextStep,
          proofNote: enteredOtp,
          proofPhotoData: attachedPhoto,
        }),
      });
      notify(`Order ${job.orderNumber} updated to "${STEP_LABELS[nextStep]}"`, 'ok');
      await loadJobs();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Transition failed.', 'error');
    } finally {
      setSubmittingId(null);
    }
  };

  const handlePhotoSelect = (jobId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      notify('Delivery photo must be under 3MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoInput((prev) => ({ ...prev, [jobId]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleIssue = async (jobId: number) => {
    const text = issueText[jobId];
    if (!text?.trim()) return;
    try {
      const token = await getIdToken();
      await apiRequest(`/api/driver/jobs/${jobId}/issue`, {
        method: 'POST',
        token,
        body: JSON.stringify({ issueReport: text }),
      });
      notify('Issue logged for operations desk.', 'info');
      setIssueText((prev) => ({ ...prev, [jobId]: '' }));
      await loadJobs();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to log issue.', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-5 py-6 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Rivers State Rider Queue</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl font-medium">Assigned Deliveries</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Proof Mode: <span className="font-medium text-[var(--ink)]">{PROOF_MODE_LABELS[proofMode] || proofMode}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadJobs()}
          className="self-start sm:self-auto min-h-[42px] inline-flex items-center gap-2 rounded-full border border-[var(--line-2)] px-4 py-2 text-xs uppercase cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="mt-6 sm:mt-8 space-y-5">
        {jobs.length === 0 ? (
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 sm:p-10 text-center text-sm text-[var(--muted)]">
            No deliveries are currently assigned to your rider profile.
          </div>
        ) : (
          jobs.map((job) => {
            const next = NEXT_STEP[job.step];
            const otpVal = (proofInput[job.id] || '').trim();
            const photoVal = photoInput[job.id] || '';

            return (
              <article key={job.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
                  <div>
                    <span className="font-mono-num text-base font-medium">{job.orderNumber}</span>
                    <span className="block sm:inline sm:ml-3 text-xs text-[var(--muted)]">{job.deliveryZone}</span>
                  </div>
                  <span
                    className="text-xs uppercase font-medium"
                    style={{ color: job.step === 'delivered' ? 'var(--ok)' : 'var(--accent)' }}
                  >
                    {STEP_LABELS[job.step]}
                  </span>
                </div>

                <div className="space-y-2.5 text-sm">
                  <p className="font-medium text-[var(--ink)]">{job.customerName}</p>
                  <p className="flex items-start gap-2 text-[var(--soft)]">
                    <MapPin className="h-4 w-4 text-[var(--champagne)] shrink-0 mt-0.5" />
                    <span>{job.address}</span>
                  </p>
                  <a
                    href={`tel:${job.customerPhone}`}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[var(--line-2)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--ink)] hover:border-[var(--accent)]"
                  >
                    <Phone className="h-4 w-4 text-[var(--accent)] shrink-0" />
                    <span className="font-mono-num">{job.customerPhone}</span>
                    <span className="text-xs text-[var(--muted)]">· Tap to call</span>
                  </a>
                </div>

                {job.step === 'delivered' && (
                  <div className="rounded-2xl border border-[var(--ok)]/40 bg-[var(--surface-2)] p-3.5 text-xs space-y-1">
                    <p className="font-medium text-[var(--ok)]">Delivery Verified</p>
                    {job.proofNote && (
                      <p className="text-[var(--muted)]">
                        Customer OTP Verified: <span className="font-mono-num text-[var(--ink)]">{job.proofNote}</span>
                      </p>
                    )}
                  </div>
                )}

                {next && (
                  <div className="border-t border-[var(--line)] pt-4 space-y-3">
                    {next === 'delivered' && (requiresOtp || requiresPhoto) && (
                      <div className="rounded-2xl border border-[var(--line-2)] bg-[var(--surface-2)] p-4 space-y-3.5">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent)]">
                          Handoff Verification Required
                        </p>

                        {requiresOtp && (
                          <div>
                            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)] mb-1.5">
                              <KeyRound className="h-3.5 w-3.5 text-[var(--accent)]" />
                              <span>1. Customer 6-Digit Delivery OTP</span>
                            </label>
                            <input
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="Enter 6-digit OTP from customer"
                              value={proofInput[job.id] || ''}
                              onChange={(e) =>
                                setProofInput((p) => ({
                                  ...p,
                                  [job.id]: e.target.value.replace(/\D/g, '').slice(0, 6),
                                }))
                              }
                              className="h-12 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3.5 text-base font-mono-num tracking-[0.22em]"
                            />
                          </div>
                        )}

                        {requiresPhoto && (
                          <div>
                            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)] mb-1.5">
                              <Camera className="h-3.5 w-3.5 text-[var(--accent)]" />
                              <span>{requiresOtp ? '2. ' : ''}Rider Delivery Confirmation Photo</span>
                            </label>
                            <label className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--line-2)] bg-[var(--bg)] p-3.5 text-xs text-[var(--muted)] cursor-pointer hover:border-[var(--accent)]">
                              <span>{photoVal ? 'Delivery photo attached ✓ (Tap to replace)' : 'Take or upload handoff photo (PNG/JPG)'}</span>
                              <Camera className="h-4 w-4 text-[var(--accent)] shrink-0" />
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                capture="environment"
                                onChange={(e) => handlePhotoSelect(job.id, e)}
                                className="hidden"
                              />
                            </label>
                            {photoVal && (
                              <img
                                src={photoVal}
                                alt={`Delivery preview for ${job.orderNumber}`}
                                className="mt-2 h-28 w-auto rounded-xl border border-[var(--line)] object-cover"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={
                        submittingId === job.id ||
                        (next === 'delivered' && ((requiresOtp && otpVal.length !== 6) || (requiresPhoto && !photoVal)))
                      }
                      onClick={() => void handleAdvance(job, next)}
                      className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)] disabled:opacity-45 cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{submittingId === job.id ? 'Verifying...' : `Mark as ${STEP_LABELS[next]}`}</span>
                    </button>
                  </div>
                )}

                {job.step !== 'delivered' && (
                  <div className="border-t border-[var(--line)] pt-3 flex flex-col sm:flex-row gap-2">
                    <input
                      placeholder="Report address / customer unreachable issue..."
                      value={issueText[job.id] || ''}
                      onChange={(e) => setIssueText((p) => ({ ...p, [job.id]: e.target.value }))}
                      className="h-11 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void handleIssue(job.id)}
                      className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--warn)] px-4 text-xs text-[var(--warn)] cursor-pointer shrink-0"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Log Issue</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
