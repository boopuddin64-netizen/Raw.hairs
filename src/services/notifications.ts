import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { notifications, storeSettings } from '../db/schema.ts';

export type NotificationEventType =
  | 'order.placed'
  | 'transfer.submitted'
  | 'transfer.rejected'
  | 'payment.verified'
  | 'order.approved'
  | 'order.dispatched'
  | 'order.delivered'
  | 'booking.created'
  | 'booking.updated'
  | 'return.submitted'
  | 'quotation.requested'
  | 'quotation.quoted';

export interface DispatchNotificationInput {
  eventType: NotificationEventType;
  entityId: string;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  emailSubject?: string;
  adminEmailSubject?: string;
  adminMessageBody?: string;
  notifyAdminEmail?: boolean;
  messageBody: string;
  dedupeSuffix?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDefaultSubject(eventType: NotificationEventType, entityId: string): string {
  const labels: Record<NotificationEventType, string> = {
    'order.placed': `Order Received · ${entityId}`,
    'transfer.submitted': `Bank Transfer Receipt Received · ${entityId}`,
    'transfer.rejected': `Transfer Verification Update · ${entityId}`,
    'payment.verified': `Payment Confirmed · ${entityId}`,
    'order.approved': `Order Approved for Preparation · ${entityId}`,
    'order.dispatched': `Order Out for Delivery · ${entityId}`,
    'order.delivered': `Order Delivered · ${entityId}`,
    'booking.created': `Salon Appointment Request · ${entityId}`,
    'booking.updated': `Salon Appointment Update · ${entityId}`,
    'return.submitted': `Return Request Received · ${entityId}`,
    'quotation.requested': `International Quote Request · ${entityId}`,
    'quotation.quoted': `International Quotation Ready · ${entityId}`,
  };
  return `Raw.hairs — ${labels[eventType] || entityId}`;
}

function buildBrandEmailHtml(params: {
  subject: string;
  entityId: string;
  eventType: NotificationEventType;
  messageBody: string;
  isAdminAlert?: boolean;
}): string {
  const badge = params.isAdminAlert ? 'Admin Desk Alert' : 'Client Concierge Update';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0e0d0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f5f0e8;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#171513;border:1px solid #2c2824;border-radius:18px;overflow:hidden;">
      <tr>
        <td style="padding:24px 28px;border-bottom:1px solid #2c2824;">
          <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a66b;">Raw.hairs · Port Harcourt</div>
          <h1 style="margin:8px 0 0;font-size:20px;font-weight:500;color:#f5f0e8;">${escapeHtml(params.subject)}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px;">
          <div style="display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid #3c342b;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#c9a66b;margin-bottom:16px;">
            ${escapeHtml(badge)} · ${escapeHtml(params.entityId)}
          </div>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#e6dfd5;">${escapeHtml(params.messageBody)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 28px;border-top:1px solid #2c2824;font-size:12px;color:#9b9184;">
          Raw.hairs Luxury Hair &amp; Salon Atelier · Rivers State &amp; International Dispatch
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendResendEmail(params: {
  idempotencyKey: string;
  eventType: NotificationEventType;
  entityId: string;
  toEmail: string;
  subject: string;
  messageBody: string;
  isAdminAlert?: boolean;
}) {
  const existing = await db
    .select()
    .from(notifications)
    .where(eq(notifications.idempotencyKey, params.idempotencyKey))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || 'Raw.hairs <onboarding@resend.dev>').trim();

  let status: 'sent' | 'simulated' | 'failed' = 'simulated';
  let providerResponse: Record<string, unknown> = {
    mode: 'sandbox_ready',
    subject: params.subject,
    note: 'Configure RESEND_API_KEY in secrets for live Resend email delivery.',
  };

  if (resendApiKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': params.idempotencyKey,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [params.toEmail],
          subject: params.subject,
          text: params.messageBody,
          html: buildBrandEmailHtml({
            subject: params.subject,
            entityId: params.entityId,
            eventType: params.eventType,
            messageBody: params.messageBody,
            isAdminAlert: params.isAdminAlert,
          }),
        }),
      });
      const json = (await resp.json()) as Record<string, unknown>;
      status = resp.ok ? 'sent' : 'failed';
      providerResponse = json;
    } catch (err) {
      status = 'failed';
      providerResponse = { error: err instanceof Error ? err.message : 'Resend network error' };
    }
  }

  const [saved] = await db
    .insert(notifications)
    .values({
      idempotencyKey: params.idempotencyKey,
      eventType: params.eventType,
      entityId: params.entityId,
      recipientPhone: params.toEmail,
      channel: 'email',
      provider: 'resend',
      messageBody: `[${params.subject}] ${params.messageBody}`,
      status,
      providerResponse,
    })
    .onConflictDoNothing()
    .returning();

  return saved ?? null;
}

async function sendWhatsAppMessage(params: {
  idempotencyKey: string;
  eventType: NotificationEventType;
  entityId: string;
  recipientPhone: string;
  messageBody: string;
  provider: string;
  enabled: boolean;
}) {
  const existing = await db
    .select()
    .from(notifications)
    .where(eq(notifications.idempotencyKey, params.idempotencyKey))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const apiKey = process.env.WHATSAPP_API_KEY || '';
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

  let status: 'sent' | 'simulated' | 'failed' = 'simulated';
  let providerResponse: Record<string, unknown> = {
    mode: params.enabled ? 'deferred_for_later' : 'disabled_in_settings',
    note: 'WhatsApp delivery queued for later setup (configure WHATSAPP_API_KEY & WHATSAPP_PHONE_NUMBER_ID).',
  };

  if (params.enabled && apiKey && phoneId && params.provider === 'meta_cloud') {
    try {
      const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: params.recipientPhone.replace(/[^0-9]/g, ''),
          type: 'text',
          text: { body: params.messageBody },
        }),
      });
      const json = (await resp.json()) as Record<string, unknown>;
      status = resp.ok ? 'sent' : 'failed';
      providerResponse = json;
    } catch (err) {
      status = 'failed';
      providerResponse = { error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  const [saved] = await db
    .insert(notifications)
    .values({
      idempotencyKey: params.idempotencyKey,
      eventType: params.eventType,
      entityId: params.entityId,
      recipientPhone: params.recipientPhone,
      channel: 'whatsapp',
      provider: params.provider,
      messageBody: params.messageBody,
      status,
      providerResponse,
    })
    .onConflictDoNothing()
    .returning();

  return saved ?? null;
}

export async function dispatchNotification(input: DispatchNotificationInput) {
  const cleanPhone = (input.recipientPhone || '').trim();
  const cleanEmail = (input.recipientEmail || '').trim().toLowerCase();
  const suffix = input.dedupeSuffix || 'default';
  const subject = input.emailSubject || formatDefaultSubject(input.eventType, input.entityId);

  const [settings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.key, 'commerce'))
    .limit(1);

  const whatsappProvider = settings?.whatsappProvider || process.env.WHATSAPP_PROVIDER || 'meta_cloud';
  const whatsappEnabled = settings ? settings.whatsappEnabled : true;

  let primaryRecord = null;

  // 1. Primary Resend Transactional Email to Customer
  if (cleanEmail && cleanEmail.includes('@')) {
    primaryRecord = await sendResendEmail({
      idempotencyKey: `email:${input.eventType}:${input.entityId}:${suffix}`,
      eventType: input.eventType,
      entityId: input.entityId,
      toEmail: cleanEmail,
      subject,
      messageBody: input.messageBody,
    });
  }

  // 2. Optional Admin Resend Email Alert (e.g. bank transfer receipt, new order, return, quote)
  const adminAlertEmail = (process.env.ADMIN_ALERT_EMAIL || 'boopuddin64@gmail.com').trim().toLowerCase();
  if (input.notifyAdminEmail && adminAlertEmail && adminAlertEmail.includes('@')) {
    const adminBody = input.adminMessageBody || input.messageBody;
    const adminSubject = input.adminEmailSubject || `[Admin Alert] ${subject}`;
    await sendResendEmail({
      idempotencyKey: `email-admin:${input.eventType}:${input.entityId}:${suffix}`,
      eventType: input.eventType,
      entityId: input.entityId,
      toEmail: adminAlertEmail,
      subject: adminSubject,
      messageBody: adminBody,
      isAdminAlert: true,
    });
  }

  // 3. WhatsApp Channel (logged & deferred safely until WHATSAPP_API_KEY is configured later)
  if (cleanPhone) {
    const waRecord = await sendWhatsAppMessage({
      idempotencyKey: `${input.eventType}:${input.entityId}:${suffix}`,
      eventType: input.eventType,
      entityId: input.entityId,
      recipientPhone: cleanPhone,
      messageBody: input.messageBody,
      provider: whatsappProvider,
      enabled: whatsappEnabled,
    });
    if (!primaryRecord) {
      primaryRecord = waRecord;
    }
  }

  return primaryRecord;
}
