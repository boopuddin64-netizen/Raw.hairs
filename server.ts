import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { and, count, desc, eq, gt, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';
import { db, verifyAndFallbackDb } from './src/db/index.ts';
import {
  auditLogs,
  bookings,
  categories,
  deliveries,
  inventoryLogs,
  notifications,
  orderItems,
  orders,
  payments,
  products,
  productVariants,
  quotations,
  returns,
  services,
  stockReservations,
  storeSettings,
  users,
} from './src/db/schema.ts';
import { ensureSeeded } from './src/db/seed.ts';
import { optionalAuth, requireAuth, requireRole, type AuthRequest } from './src/middleware/auth.ts';
import { writeAuditLog } from './src/services/audit.ts';
import { dispatchNotification } from './src/services/notifications.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ['paid', 'awaiting_transfer_confirmation', 'cancelled'],
  awaiting_transfer_confirmation: ['paid', 'approved', 'cancelled'],
  paid: ['approved', 'cancelled', 'refunded'],
  approved: ['processing', 'cancelled', 'refunded'],
  processing: ['ready_for_dispatch', 'cancelled', 'refunded'],
  ready_for_dispatch: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

function makeCode(prefix: string) {
  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function generateDeliveryOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

async function expireStaleReservations() {
  await db
    .update(stockReservations)
    .set({ status: 'expired' })
    .where(and(eq(stockReservations.status, 'active'), lt(stockReservations.expiresAt, new Date())));
}

async function commitOrderPayment(params: {
  reference: string;
  amountNgn: number;
  channel: string;
  webhookEventId?: string;
  rawPayload?: Record<string, unknown>;
}) {
  const result = await db.transaction(async (tx) => {
    const [existingPayment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.reference, params.reference))
      .limit(1);

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.paystackReference, params.reference))
      .limit(1);

    if (!order) {
      return { notFound: true as const };
    }

    if (existingPayment && existingPayment.status === 'paid' && order.paymentStatus === 'paid') {
      return { alreadyProcessed: true as const, order };
    }

    const reservations = await tx
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, 'active')));

    if (reservations.length > 0) {
      for (const resv of reservations) {
        await tx
          .update(productVariants)
          .set({ totalStock: sql`GREATEST(0, ${productVariants.totalStock} - ${resv.quantity})` })
          .where(eq(productVariants.id, resv.variantId));

        await tx.insert(inventoryLogs).values({
          variantId: resv.variantId,
          delta: -resv.quantity,
          reason: 'order_paid_commit',
          referenceCode: order.orderNumber,
          actorUid: order.userUid || 'paystack',
        });
      }

      await tx
        .update(stockReservations)
        .set({ status: 'committed' })
        .where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, 'active')));
    }

    const nextStatus = order.status === 'pending_payment' ? 'paid' : order.status;
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        paymentStatus: 'paid',
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    await tx
      .insert(payments)
      .values({
        orderId: order.id,
        reference: params.reference,
        provider: 'paystack',
        amountNgn: params.amountNgn,
        status: 'paid',
        channel: params.channel,
        webhookEventId: params.webhookEventId || null,
        rawPayload: params.rawPayload || {},
        verifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: payments.reference,
        set: {
          status: 'paid',
          channel: params.channel,
          webhookEventId: params.webhookEventId || null,
          rawPayload: params.rawPayload || {},
          verifiedAt: new Date(),
        },
      });

    return { alreadyProcessed: false as const, order: updatedOrder };
  });

  if ('order' in result && result.order && !result.alreadyProcessed) {
    await dispatchNotification({
      eventType: 'payment.verified',
      entityId: result.order.orderNumber,
      recipientPhone: result.order.customerPhone,
      recipientEmail: result.order.customerEmail,
      emailSubject: `Raw.hairs — Payment Verified for Order ${result.order.orderNumber}`,
      notifyAdminEmail: true,
      adminMessageBody: `Paystack payment verified for Order ${result.order.orderNumber} (${result.order.customerName}, ₦${result.order.totalNgn.toLocaleString()}). Ready for Admin review.`,
      dedupeSuffix: params.reference,
      messageBody: `Raw.hairs: Payment verified for Order ${result.order.orderNumber} (₦${result.order.totalNgn.toLocaleString()}). Our Port Harcourt team is reviewing your order.`,
    });
  }

  return result;
}

async function startServer() {
  await verifyAndFallbackDb();
  const app = express();
  const httpServer = http.createServer(app);

  // Raw body parser exclusively for Paystack HMAC-SHA512 webhook verification
  app.post(
    '/api/paystack/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        await ensureSeeded();
        const secret = process.env.PAYSTACK_SECRET_KEY || '';
        const signature = String(req.headers['x-paystack-signature'] || '');
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

        if (secret) {
          const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
          const sigBuf = Buffer.from(signature);
          const expBuf = Buffer.from(expected);
          if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return res.status(401).json({ error: 'Invalid Paystack webhook signature.' });
          }
        }

        const event = JSON.parse(rawBody.toString('utf8')) as {
          event?: string;
          data?: {
            id?: number | string;
            reference?: string;
            amount?: number;
            channel?: string;
            metadata?: { quotationId?: number };
          };
        };

        if (event.event === 'charge.success' && event.data?.reference) {
          const quotationId = event.data.metadata?.quotationId;
          if (quotationId) {
            await db
              .update(quotations)
              .set({ status: 'paid', paystackReference: event.data.reference, updatedAt: new Date() })
              .where(eq(quotations.id, quotationId));
          } else {
            await commitOrderPayment({
              reference: event.data.reference,
              amountNgn: Math.round((event.data.amount || 0) / 100),
              channel: event.data.channel || 'paystack_webhook',
              webhookEventId: event.data.id ? String(event.data.id) : undefined,
              rawPayload: event as unknown as Record<string, unknown>,
            });
          }
        }

        return res.status(200).json({ received: true });
      } catch (error) {
        console.error('Paystack webhook error:', error);
        return res.status(500).json({ error: 'Webhook processing failed.' });
      }
    },
  );

  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'rawhairs-api' });
  });

  // Public Bootstrap: categories, products with live availableStock, services, commerce settings
  app.get('/api/bootstrap', async (_req, res) => {
    try {
      await ensureSeeded();
      await expireStaleReservations();

      const [allCategories, allProducts, allVariants, activeReservations, allServices, [settings]] =
        await Promise.all([
          db.select().from(categories).where(eq(categories.isActive, true)).orderBy(categories.sortOrder),
          db.select().from(products).where(eq(products.isActive, true)).orderBy(desc(products.featured), products.id),
          db.select().from(productVariants).where(eq(productVariants.isActive, true)).orderBy(productVariants.lengthInches),
          db
            .select({
              variantId: stockReservations.variantId,
              qty: sql<number>`COALESCE(SUM(${stockReservations.quantity}), 0)::int`,
            })
            .from(stockReservations)
            .where(and(eq(stockReservations.status, 'active'), gt(stockReservations.expiresAt, new Date())))
            .groupBy(stockReservations.variantId),
          db.select().from(services).where(eq(services.isActive, true)).orderBy(services.id),
          db.select().from(storeSettings).where(eq(storeSettings.key, 'commerce')).limit(1),
        ]);

      const reservedMap = new Map<number, number>();
      for (const r of activeReservations) {
        reservedMap.set(r.variantId, Number(r.qty) || 0);
      }

      const variantsByProduct = new Map<number, Array<typeof allVariants[number] & { availableStock: number }>>();
      for (const v of allVariants) {
        const reserved = reservedMap.get(v.id) || 0;
        const availableStock = Math.max(0, v.totalStock - reserved);
        const list = variantsByProduct.get(v.productId) || [];
        list.push({ ...v, availableStock });
        variantsByProduct.set(v.productId, list);
      }

      const enrichedProducts = allProducts.map((p) => ({
        ...p,
        variants: variantsByProduct.get(p.id) || [],
      }));

      res.json({
        categories: allCategories,
        products: enrichedProducts,
        services: allServices,
        settings: settings
          ? {
              riversZones: settings.riversZones,
              interstateZones: settings.interstateZones,
              podEnabled: settings.podEnabled,
              podAllowedZones: settings.podAllowedZones,
              podMaxOrderNgn: settings.podMaxOrderNgn,
              bankTransferEnabled: settings.bankTransferEnabled,
              bankName: settings.bankName,
              bankAccountNumber: settings.bankAccountNumber,
              bankAccountName: settings.bankAccountName,
              bankTransferInstructions: settings.bankTransferInstructions,
              deliveryProofMode: settings.deliveryProofMode,
              returnWindowHours: settings.returnWindowHours,
              returnEligibilityNotes: settings.returnEligibilityNotes,
            }
          : null,
        paystackConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY),
      });
    } catch (error) {
      console.error('Bootstrap error:', error);
      const errObj = error as { cause?: { code?: string; message?: string }; code?: string; message?: string };
      const cause = errObj?.cause || errObj;
      const code = cause?.code || errObj?.code || '';
      const rawMsg = cause?.message || errObj?.message || '';
      const msg = String(rawMsg).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_URL]');

      if (code === '28P01' || msg.includes('password authentication failed')) {
        return res.status(500).json({
          error:
            'Supabase Postgres authentication failed. Check SUPABASE_DB_URL: use the Session Pooler username (postgres.<project-ref>), remove any [ ] brackets around the password, and verify your Project Database Password in Supabase Settings → Database.',
        });
      }
      if (
        code === 'ECONNREFUSED' ||
        code === 'ENETUNREACH' ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ENETUNREACH')
      ) {
        return res.status(500).json({
          error:
            'Cannot reach Supabase direct DB host over IPv6 from this server. In Supabase Dashboard → Connect, switch Method from "Direct connection" to "Session pooler" (IPv4 compatible, aws-0-*.pooler.supabase.com:5432) and update SUPABASE_DB_URL.',
        });
      }
      if (code === '42P01' || msg.includes('does not exist')) {
        return res.status(500).json({
          error:
            'Connected to Supabase Postgres, but Raw.hairs tables have not been pushed yet. Ready to inspect existing tables first.',
        });
      }
      res.status(500).json({
        error: `Unable to load storefront catalogue right now${code || msg ? ` (${[code, msg].filter(Boolean).join(': ')})` : ''}.`,
      });
    }
  });

  // Auth Profile Sync
  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      res.json({ user: req.dbUser });
    } catch (error) {
      console.error('Auth me error:', error);
      res.status(500).json({ error: 'Unable to load profile.' });
    }
  });

  app.patch('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fullName, phone, defaultState, defaultZone, defaultAddress } = req.body || {};
      const [updated] = await db
        .update(users)
        .set({
          fullName: typeof fullName === 'string' ? fullName.trim().slice(0, 120) : req.dbUser!.fullName,
          phone: typeof phone === 'string' ? phone.trim().slice(0, 40) : req.dbUser!.phone,
          defaultState: typeof defaultState === 'string' ? defaultState.trim().slice(0, 60) : req.dbUser!.defaultState,
          defaultZone: typeof defaultZone === 'string' ? defaultZone.trim().slice(0, 60) : req.dbUser!.defaultZone,
          defaultAddress: typeof defaultAddress === 'string' ? defaultAddress.trim().slice(0, 300) : req.dbUser!.defaultAddress,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, req.dbUser!.uid))
        .returning();

      res.json({ user: updated });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ error: 'Could not update your profile.' });
    }
  });

  // Checkout: Atomic 15-Minute Stock Reservation + Server-Priced Order Creation
  app.post('/api/checkout/reserve', optionalAuth, async (req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const {
        items,
        customerName,
        customerEmail,
        customerPhone,
        state,
        deliveryZone,
        city,
        address,
        instructions,
        paymentMethod,
      } = req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Your shopping bag is empty.' });
      }
      if (!customerName?.trim() || !customerEmail?.trim() || !customerPhone?.trim() || !address?.trim()) {
        return res.status(400).json({ error: 'Please complete your name, email, WhatsApp phone, and street address.' });
      }

      const method = paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'paystack';
      const [settings] = await db
        .select()
        .from(storeSettings)
        .where(eq(storeSettings.key, 'commerce'))
        .limit(1);

      if (method === 'bank_transfer' && settings && !settings.bankTransferEnabled) {
        return res.status(409).json({ error: 'Direct Bank Transfer is currently unavailable.' });
      }

      const cleanState = String(state || 'Rivers').trim();
      const cleanZone = String(deliveryZone || 'ph-gra').trim();

      let deliveryFeeNgn = 6500;
      let resolvedZoneName = cleanZone;

      if (cleanState.toLowerCase() === 'rivers') {
        const zone = settings?.riversZones.find((z) => z.id === cleanZone) || settings?.riversZones[0];
        if (zone) {
          deliveryFeeNgn = zone.feeNgn;
          resolvedZoneName = zone.name;
        }
      } else {
        const interZone =
          settings?.interstateZones.find((z) =>
            z.states.some((s) => s.toLowerCase() === cleanState.toLowerCase()),
          ) || settings?.interstateZones[settings.interstateZones.length - 1];
        if (interZone) {
          deliveryFeeNgn = interZone.feeNgn;
          resolvedZoneName = `${cleanState} (${interZone.name})`;
        }
      }

      const sessionToken = crypto.randomBytes(12).toString('hex');
      const orderNumber = makeCode('RH');
      const paystackReference = method === 'paystack' ? makeCode('PSK') : null;
      const holdMinutes = method === 'bank_transfer' ? 30 : 15;
      const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);

      const outcome = await db.transaction(async (tx) => {
        await tx
          .update(stockReservations)
          .set({ status: 'expired' })
          .where(and(eq(stockReservations.status, 'active'), lt(stockReservations.expiresAt, new Date())));

        let subtotalNgn = 0;
        const resolvedLines: Array<{
          productId: number;
          variantId: number;
          productName: string;
          sku: string;
          lengthInches: number;
          laceType: string;
          unitPriceNgn: number;
          quantity: number;
          lineTotalNgn: number;
        }> = [];

        for (const reqItem of items) {
          const variantId = Number(reqItem.variantId);
          const qty = Math.max(1, Math.min(20, Number(reqItem.quantity) || 1));

          const variantRows = await tx.execute(
            sql`SELECT pv.id, pv.product_id, pv.sku, pv.length_inches, pv.lace_type, pv.price_ngn, pv.total_stock, p.name AS product_name
                FROM product_variants pv
                JOIN products p ON p.id = pv.product_id
                WHERE pv.id = ${variantId} AND pv.is_active = true AND p.is_active = true
                FOR UPDATE OF pv`,
          );

          const v = variantRows.rows[0] as
            | {
                id: number;
                product_id: number;
                sku: string;
                length_inches: number;
                lace_type: string;
                price_ngn: number;
                total_stock: number;
                product_name: string;
              }
            | undefined;

          if (!v) {
            throw new Error('OUT_OF_STOCK:Selected hair variant is no longer available.');
          }

          const activeRes = await tx
            .select({
              reserved: sql<number>`COALESCE(SUM(${stockReservations.quantity}), 0)::int`,
            })
            .from(stockReservations)
            .where(
              and(
                eq(stockReservations.variantId, v.id),
                eq(stockReservations.status, 'active'),
                gt(stockReservations.expiresAt, new Date()),
              ),
            );

          const available = v.total_stock - (Number(activeRes[0]?.reserved) || 0);
          if (available < qty) {
            const specLabel = v.length_inches > 0 ? `${v.length_inches}"` : v.lace_type;
            throw new Error(
              `OUT_OF_STOCK:Only ${Math.max(0, available)} unit(s) left for ${v.product_name} (${specLabel}).`,
            );
          }

          const lineTotalNgn = v.price_ngn * qty;
          subtotalNgn += lineTotalNgn;
          resolvedLines.push({
            productId: v.product_id,
            variantId: v.id,
            productName: v.product_name,
            sku: v.sku,
            lengthInches: v.length_inches,
            laceType: v.lace_type,
            unitPriceNgn: v.price_ngn,
            quantity: qty,
            lineTotalNgn,
          });
        }

        const totalNgn = subtotalNgn + deliveryFeeNgn;

        const [order] = await tx
          .insert(orders)
          .values({
            orderNumber,
            userUid: req.dbUser?.uid || null,
            customerName: customerName.trim().slice(0, 120),
            customerEmail: customerEmail.trim().slice(0, 160),
            customerPhone: customerPhone.trim().slice(0, 40),
            state: cleanState.slice(0, 60),
            deliveryZone: resolvedZoneName.slice(0, 140),
            city: String(city || cleanState).trim().slice(0, 80),
            address: address.trim().slice(0, 300),
            instructions: instructions ? String(instructions).trim().slice(0, 500) : null,
            currency: 'NGN',
            subtotalNgn,
            deliveryFeeNgn,
            totalNgn,
            paymentMethod: method,
            paymentStatus: 'pending',
            paystackReference,
            status: 'pending_payment',
          })
          .returning();

        for (const line of resolvedLines) {
          await tx.insert(orderItems).values({
            orderId: order.id,
            ...line,
          });

          await tx.insert(stockReservations).values({
            sessionToken,
            orderId: order.id,
            variantId: line.variantId,
            quantity: line.quantity,
            status: 'active',
            expiresAt,
          });
        }

        return { order, lines: resolvedLines };
      });

      await dispatchNotification({
        eventType: 'order.placed',
        entityId: outcome.order.orderNumber,
        recipientPhone: outcome.order.customerPhone,
        recipientEmail: outcome.order.customerEmail,
        emailSubject: `Raw.hairs — Order ${outcome.order.orderNumber} Reserved`,
        notifyAdminEmail: true,
        adminMessageBody: `New ${method === 'bank_transfer' ? 'Direct Bank Transfer' : 'Paystack'} order ${outcome.order.orderNumber} from ${outcome.order.customerName} (${outcome.order.customerEmail}) for ₦${outcome.order.totalNgn.toLocaleString()} (${outcome.order.deliveryZone}).`,
        dedupeSuffix: outcome.order.orderNumber,
        messageBody:
          method === 'bank_transfer'
            ? `Raw.hairs: Order ${outcome.order.orderNumber} reserved (₦${outcome.order.totalNgn.toLocaleString()}). Complete your bank transfer and upload your receipt & transaction code for Admin confirmation.`
            : `Raw.hairs: Order ${outcome.order.orderNumber} created (₦${outcome.order.totalNgn.toLocaleString()}). Your stock is reserved for 15 minutes while completing payment.`,
      });

      res.status(201).json({
        order: outcome.order,
        items: outcome.lines,
        sessionToken,
        expiresAt: expiresAt.toISOString(),
        paystackPublicKey: process.env.VITE_PAYSTACK_PUBLIC_KEY || null,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Checkout failed.';
      if (msg.startsWith('OUT_OF_STOCK:') || msg.startsWith('BANK_')) {
        return res.status(409).json({ error: msg.split(':')[1] });
      }
      console.error('Reserve checkout error:', error);
      return res.status(500).json({ error: 'Unable to reserve stock right now. Please try again.' });
    }
  });

  // Customer: Submit Direct Bank Transfer Receipt & Transaction Code for Admin Confirmation
  app.post('/api/orders/:orderNumber/bank-transfer-proof', optionalAuth, async (req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();
      const { customerEmail, transactionCode, receiptImage } = req.body || {};

      const cleanCode = String(transactionCode || '').trim();
      if (cleanCode.length < 4 || cleanCode.length > 100) {
        return res.status(400).json({ error: 'Please enter a valid bank transaction code or session ID (4–100 chars).' });
      }

      const cleanReceipt = String(receiptImage || '').trim();
      if (
        !/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(cleanReceipt) ||
        cleanReceipt.length > 4_500_000
      ) {
        return res.status(400).json({ error: 'Please upload a valid PNG, JPG, or WebP transfer receipt image (max 3MB).' });
      }

      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const isOwner =
        (req.dbUser?.uid && order.userUid && req.dbUser.uid === order.userUid) ||
        (typeof customerEmail === 'string' &&
          order.customerEmail.toLowerCase() === customerEmail.trim().toLowerCase());

      if (!isOwner) {
        return res.status(403).json({ error: 'Order verification email does not match this order.' });
      }

      if (order.paymentMethod !== 'bank_transfer') {
        return res.status(409).json({ error: 'This order uses Paystack online payment rather than Direct Bank Transfer.' });
      }

      if (order.paymentStatus === 'paid') {
        return res.status(409).json({ error: 'Payment for this order has already been confirmed.' });
      }

      const updatedOrder = await db.transaction(async (tx) => {
        const extendedHold = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await tx
          .update(stockReservations)
          .set({ status: 'active', expiresAt: extendedHold })
          .where(and(eq(stockReservations.orderId, order.id), inArray(stockReservations.status, ['active', 'expired'])));

        const [updated] = await tx
          .update(orders)
          .set({
            bankTransactionCode: cleanCode,
            bankTransferReceipt: cleanReceipt,
            bankTransferSubmittedAt: new Date(),
            paymentStatus: 'awaiting_confirmation',
            status: 'awaiting_transfer_confirmation',
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();

        const transferRef = `BT-${order.orderNumber}`;
        await tx
          .insert(payments)
          .values({
            orderId: order.id,
            reference: transferRef,
            provider: 'bank_transfer',
            amountNgn: order.totalNgn,
            status: 'awaiting_confirmation',
            channel: 'bank_transfer',
            rawPayload: { transactionCode: cleanCode },
          })
          .onConflictDoUpdate({
            target: payments.reference,
            set: {
              status: 'awaiting_confirmation',
              rawPayload: { transactionCode: cleanCode },
            },
          });

        return updated;
      });

      await dispatchNotification({
        eventType: 'transfer.submitted',
        entityId: updatedOrder.orderNumber,
        recipientPhone: updatedOrder.customerPhone,
        recipientEmail: updatedOrder.customerEmail,
        emailSubject: `Raw.hairs — Bank Transfer Proof Received (${updatedOrder.orderNumber})`,
        notifyAdminEmail: true,
        adminEmailSubject: `[Action Required] Bank Transfer Verification · ${updatedOrder.orderNumber}`,
        adminMessageBody: `Customer ${updatedOrder.customerName} (${updatedOrder.customerEmail}) submitted Bank Transfer receipt & transaction code "${cleanCode}" for Order ${updatedOrder.orderNumber} (₦${updatedOrder.totalNgn.toLocaleString()}). Review and confirm in Admin Console.`,
        dedupeSuffix: `${updatedOrder.orderNumber}-${cleanCode.slice(0, 12)}`,
        messageBody: `Raw.hairs: Bank transfer receipt & code (${cleanCode}) received for Order ${updatedOrder.orderNumber}. Our Admin Desk will verify and approve shortly.`,
      });

      return res.json({ ok: true, order: updatedOrder });
    } catch (error) {
      console.error('Bank transfer proof error:', error);
      return res.status(500).json({ error: 'Unable to submit transfer proof right now.' });
    }
  });

  // Initialize Paystack Checkout URL (server-side secret protected)
  app.post('/api/paystack/initialize', async (req, res) => {
    try {
      const { reference } = req.body || {};
      if (!reference) return res.status(400).json({ error: 'Payment reference required.' });

      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.paystackReference, String(reference)))
        .limit(1);

      if (!order) return res.status(404).json({ error: 'Order not found.' });

      const secret = process.env.PAYSTACK_SECRET_KEY || '';
      if (!secret) {
        return res.json({
          mode: 'test_simulation',
          reference,
          amountNgn: order.totalNgn,
          email: order.customerEmail,
        });
      }

      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const resp = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: order.customerEmail,
          amount: order.totalNgn * 100,
          reference,
          callback_url: `${appUrl}/?pay=${encodeURIComponent(reference)}`,
          metadata: { orderNumber: order.orderNumber },
        }),
      });
      const json = (await resp.json()) as {
        status?: boolean;
        message?: string;
        data?: { authorization_url?: string; access_code?: string };
      };
      if (!resp.ok || !json.status) {
        return res.status(502).json({ error: json.message || 'Paystack initialization failed.' });
      }

      return res.json({
        mode: 'live',
        authorizationUrl: json.data?.authorization_url,
        accessCode: json.data?.access_code,
        reference,
      });
    } catch (error) {
      console.error('Paystack initialize error:', error);
      return res.status(500).json({ error: 'Payment initialization error.' });
    }
  });

  // Verify Paystack Transaction (Server-side authoritative)
  app.post('/api/paystack/verify', async (req, res) => {
    try {
      await ensureSeeded();
      const { reference, quotationId } = req.body || {};
      if (!reference) return res.status(400).json({ error: 'Payment reference is required.' });

      const secret = process.env.PAYSTACK_SECRET_KEY || '';
      let verifiedAmountNgn = 0;
      let channel = 'test_card';
      let rawPayload: Record<string, unknown> = { mode: 'sandbox_verified' };

      if (secret) {
        const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(String(reference))}`, {
          headers: { Authorization: `Bearer ${secret}` },
        });
        const json = (await resp.json()) as {
          status?: boolean;
          message?: string;
          data?: { status?: string; amount?: number; channel?: string };
        };
        if (!resp.ok || !json.status || json.data?.status !== 'success') {
          return res.status(402).json({ error: json.message || 'Paystack transaction has not succeeded yet.' });
        }
        verifiedAmountNgn = Math.round((json.data.amount || 0) / 100);
        channel = json.data.channel || 'paystack';
        rawPayload = json as unknown as Record<string, unknown>;
      }

      if (quotationId) {
        const [updatedQuote] = await db
          .update(quotations)
          .set({ status: 'paid', paystackReference: String(reference), updatedAt: new Date() })
          .where(eq(quotations.id, Number(quotationId)))
          .returning();
        return res.json({ ok: true, quotation: updatedQuote });
      }

      const [orderLookup] = await db
        .select()
        .from(orders)
        .where(eq(orders.paystackReference, String(reference)))
        .limit(1);

      if (!orderLookup) {
        return res.status(404).json({ error: 'No order matches this Paystack reference.' });
      }

      const amountToRecord = secret ? verifiedAmountNgn : orderLookup.totalNgn;
      const result = await commitOrderPayment({
        reference: String(reference),
        amountNgn: amountToRecord,
        channel,
        rawPayload,
      });

      if ('notFound' in result) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      return res.json({ ok: true, order: result.order });
    } catch (error) {
      console.error('Paystack verify error:', error);
      return res.status(500).json({ error: 'Unable to verify payment right now.' });
    }
  });

  // Public Order Tracking
  app.get('/api/orders/track/:orderNumber', async (req, res) => {
    try {
      const code = String(req.params.orderNumber || '').trim().toUpperCase();
      const contact = String(req.query.contact || '').trim().toLowerCase();

      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.orderNumber, code))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: 'No order found with that reference number.' });
      }

      if (
        contact &&
        order.customerEmail.toLowerCase() !== contact &&
        !order.customerPhone.toLowerCase().includes(contact)
      ) {
        return res.status(403).json({ error: 'Email or WhatsApp number does not match this order.' });
      }

      const [items, [delivery]] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
        db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1),
      ]);

      return res.json({
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          state: order.state,
          deliveryZone: order.deliveryZone,
          city: order.city,
          subtotalNgn: order.subtotalNgn,
          deliveryFeeNgn: order.deliveryFeeNgn,
          totalNgn: order.totalNgn,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          bankTransactionCode: order.bankTransactionCode,
          hasReceipt: Boolean(order.bankTransferReceipt),
          deliveryOtp: contact && order.deliveryOtp && order.status !== 'delivered' ? order.deliveryOtp : null,
          deliveryProofMode: order.deliveryProofMode,
          status: order.status,
          deliveredAt: order.deliveredAt,
          createdAt: order.createdAt,
        },
        items,
        deliveryStep: delivery?.step || null,
      });
    } catch (error) {
      console.error('Track order error:', error);
      return res.status(500).json({ error: 'Could not look up order.' });
    }
  });

  // Customer Account Summary
  app.get('/api/account/summary', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.dbUser!.uid;
      const email = req.dbUser!.email;

      const userOrders = await db
        .select()
        .from(orders)
        .where(sql`${orders.userUid} = ${uid} OR LOWER(${orders.customerEmail}) = LOWER(${email})`)
        .orderBy(desc(orders.createdAt));

      const orderIds = userOrders.map((o) => o.id);
      const items =
        orderIds.length > 0
          ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
          : [];

      const [userBookings, userQuotations, userReturns] = await Promise.all([
        db.select().from(bookings).where(eq(bookings.userUid, uid)).orderBy(desc(bookings.scheduledAt)),
        db
          .select()
          .from(quotations)
          .where(sql`${quotations.userUid} = ${uid} OR LOWER(${quotations.customerEmail}) = LOWER(${email})`)
          .orderBy(desc(quotations.createdAt)),
        db
          .select()
          .from(returns)
          .where(sql`${returns.userUid} = ${uid} OR LOWER(${returns.customerEmail}) = LOWER(${email})`)
          .orderBy(desc(returns.createdAt)),
      ]);

      res.json({
        orders: userOrders.map((o) => ({
          ...o,
          items: items.filter((it) => it.orderId === o.id),
        })),
        bookings: userBookings,
        quotations: userQuotations,
        returns: userReturns,
      });
    } catch (error) {
      console.error('Account summary error:', error);
      res.status(500).json({ error: 'Unable to load your account history.' });
    }
  });

  // Salon Service Bookings (with 1h min, 90d max, and atomic slot-conflict prevention)
  app.post('/api/bookings', optionalAuth, async (req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const { serviceId, scheduledAt, customerName, customerPhone, notes } = req.body || {};

      if (!customerName?.trim() || !customerPhone?.trim() || !serviceId || !scheduledAt) {
        return res.status(400).json({ error: 'Please complete your name, WhatsApp number, service, and preferred slot.' });
      }

      const targetTime = new Date(scheduledAt);
      if (Number.isNaN(targetTime.getTime())) {
        return res.status(400).json({ error: 'Please select a valid date and time.' });
      }

      const now = Date.now();
      if (targetTime.getTime() < now + 60 * 60 * 1000) {
        return res.status(400).json({ error: 'Please choose a time at least 1 hour from now.' });
      }
      if (targetTime.getTime() > now + 90 * 24 * 60 * 60 * 1000) {
        return res.status(400).json({ error: 'Studio appointments can be booked up to 90 days ahead.' });
      }

      const [service] = await db
        .select()
        .from(services)
        .where(and(eq(services.id, Number(serviceId)), eq(services.isActive, true)))
        .limit(1);

      if (!service) {
        return res.status(404).json({ error: 'Selected service is currently unavailable.' });
      }

      // Normalize slot key to 1-hour studio blocks to prevent concurrent double-booking
      const isoHour = targetTime.toISOString().slice(0, 13);
      const slotKey = `svc_${service.id}_${isoHour}`;

      const conflicting = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.slotKey, slotKey), sql`${bookings.status} != 'cancelled'`))
        .limit(1);

      if (conflicting.length > 0) {
        return res.status(409).json({
          error: 'That studio time slot is already reserved. Please pick another hour.',
        });
      }

      const bookingCode = makeCode('BK');
      const [created] = await db
        .insert(bookings)
        .values({
          bookingCode,
          serviceId: service.id,
          serviceName: service.name,
          userUid: req.dbUser?.uid || null,
          customerName: customerName.trim().slice(0, 120),
          customerPhone: customerPhone.trim().slice(0, 40),
          scheduledAt: targetTime,
          slotKey,
          notes: notes ? String(notes).trim().slice(0, 1500) : null,
          status: 'pending',
        })
        .returning();

      await dispatchNotification({
        eventType: 'booking.created',
        entityId: created.bookingCode,
        recipientPhone: created.customerPhone,
        recipientEmail: req.dbUser?.email || null,
        emailSubject: `Raw.hairs Studio — Booking Request ${created.bookingCode}`,
        notifyAdminEmail: true,
        adminMessageBody: `New salon booking ${created.bookingCode} for ${created.serviceName} by ${created.customerName} (${created.customerPhone}) scheduled for ${created.scheduledAt.toISOString()}.`,
        dedupeSuffix: created.bookingCode,
        messageBody: `Raw.hairs Studio: Booking request ${created.bookingCode} for ${created.serviceName} received. Our Port Harcourt stylist team will confirm shortly.`,
      });

      res.status(201).json({ booking: created });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('bookings_slot_key_unique')) {
        return res.status(409).json({ error: 'That time slot was just reserved. Please select another time.' });
      }
      console.error('Booking error:', error);
      return res.status(500).json({ error: 'Could not submit booking request.' });
    }
  });

  // International Quotations
  app.post('/api/quotations', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { customerName, customerEmail, customerPhone, country, city, postalCode, itemsSummary, notes } =
        req.body || {};

      if (
        !customerName?.trim() ||
        !customerEmail?.trim() ||
        !customerPhone?.trim() ||
        !country?.trim() ||
        !city?.trim() ||
        !Array.isArray(itemsSummary) ||
        itemsSummary.length === 0
      ) {
        return res.status(400).json({ error: 'Please complete contact info, destination country/city, and at least one item.' });
      }

      const [created] = await db
        .insert(quotations)
        .values({
          quoteCode: makeCode('QT'),
          userUid: req.dbUser?.uid || null,
          customerName: customerName.trim().slice(0, 120),
          customerEmail: customerEmail.trim().slice(0, 160),
          customerPhone: customerPhone.trim().slice(0, 40),
          country: country.trim().slice(0, 80),
          city: city.trim().slice(0, 80),
          postalCode: postalCode ? String(postalCode).trim().slice(0, 30) : null,
          itemsSummary,
          notes: notes ? String(notes).trim().slice(0, 1200) : null,
          status: 'requested',
        })
        .returning();

      await dispatchNotification({
        eventType: 'quotation.requested',
        entityId: created.quoteCode,
        recipientPhone: created.customerPhone,
        recipientEmail: created.customerEmail,
        emailSubject: `Raw.hairs International — Quote Request ${created.quoteCode}`,
        notifyAdminEmail: true,
        adminMessageBody: `New international quotation request ${created.quoteCode} from ${created.customerName} (${created.customerEmail}) for ${created.city}, ${created.country}.`,
        dedupeSuffix: created.quoteCode,
        messageBody: `Raw.hairs International: Your quote request ${created.quoteCode} for ${created.city}, ${created.country} has been received. Our concierge desk will send your USD invoice shortly.`,
      });

      res.status(201).json({ quotation: created });
    } catch (error) {
      console.error('Quotation create error:', error);
      res.status(500).json({ error: 'Could not submit quotation request.' });
    }
  });

  app.post('/api/quotations/:id/respond', requireAuth, async (req: AuthRequest, res) => {
    try {
      const quoteId = Number(req.params.id);
      const { action } = req.body || {};
      if (!['accept', 'decline', 'pay'].includes(action)) {
        return res.status(400).json({ error: 'Invalid quotation action.' });
      }

      const [quote] = await db.select().from(quotations).where(eq(quotations.id, quoteId)).limit(1);
      if (!quote) return res.status(404).json({ error: 'Quotation not found.' });

      if (
        quote.userUid !== req.dbUser!.uid &&
        quote.customerEmail.toLowerCase() !== req.dbUser!.email.toLowerCase() &&
        req.dbUser!.role !== 'owneradmin'
      ) {
        return res.status(403).json({ error: 'Forbidden.' });
      }

      const nextStatus = action === 'decline' ? 'declined' : action === 'pay' ? 'paid' : 'accepted';
      const ref = action === 'pay' ? makeCode('QTPSK') : quote.paystackReference;

      const [updated] = await db
        .update(quotations)
        .set({ status: nextStatus, paystackReference: ref, updatedAt: new Date() })
        .where(eq(quotations.id, quoteId))
        .returning();

      res.json({ quotation: updated });
    } catch (error) {
      console.error('Quotation respond error:', error);
      res.status(500).json({ error: 'Could not update quotation.' });
    }
  });

  // 48-Hour Returns Submission
  app.post('/api/returns', optionalAuth, async (req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const { orderNumber, customerEmail, customerPhone, reason, conditionChecklist, evidencePhotos } = req.body || {};

      if (!orderNumber?.trim() || !customerEmail?.trim() || !reason?.trim()) {
        return res.status(400).json({ error: 'Order number, email, and return reason are required.' });
      }

      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.orderNumber, String(orderNumber).trim().toUpperCase()))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      if (order.customerEmail.toLowerCase() !== String(customerEmail).trim().toLowerCase()) {
        return res.status(403).json({ error: 'Email does not match the order record.' });
      }

      if (order.status !== 'delivered' || !order.deliveredAt) {
        return res.status(409).json({ error: 'Returns can only be filed after an order is delivered.' });
      }

      const [settings] = await db
        .select()
        .from(storeSettings)
        .where(eq(storeSettings.key, 'commerce'))
        .limit(1);
      const windowHours = settings?.returnWindowHours || 48;

      if (Date.now() - new Date(order.deliveredAt).getTime() > windowHours * 3600 * 1000) {
        return res.status(409).json({
          error: `This order is outside the ${windowHours}-hour post-delivery return window.`,
        });
      }

      const photos = Array.isArray(evidencePhotos) ? evidencePhotos.slice(0, 4) : [];
      if (photos.length === 0) {
        return res.status(400).json({ error: 'At least one photographic evidence image is required.' });
      }

      const [created] = await db
        .insert(returns)
        .values({
          returnCode: makeCode('RET'),
          orderId: order.id,
          orderNumber: order.orderNumber,
          userUid: req.dbUser?.uid || order.userUid,
          customerEmail: order.customerEmail,
          customerPhone: String(customerPhone || order.customerPhone).trim(),
          reason: String(reason).trim().slice(0, 1200),
          conditionChecklist: Array.isArray(conditionChecklist) ? conditionChecklist : [],
          evidencePhotos: photos,
          status: 'submitted',
        })
        .returning();

      await dispatchNotification({
        eventType: 'return.submitted',
        entityId: created.returnCode,
        recipientPhone: created.customerPhone,
        recipientEmail: created.customerEmail,
        emailSubject: `Raw.hairs — Return Claim ${created.returnCode} Submitted`,
        notifyAdminEmail: true,
        adminMessageBody: `New return claim ${created.returnCode} filed for Order ${created.orderNumber} by ${created.customerEmail}. Reason: ${created.reason}`,
        dedupeSuffix: created.returnCode,
        messageBody: `Raw.hairs: Return claim ${created.returnCode} for Order ${created.orderNumber} submitted. Our team will inspect your photos within 24 hours.`,
      });

      res.status(201).json({ returnClaim: created });
    } catch (error) {
      console.error('Return claim error:', error);
      res.status(500).json({ error: 'Unable to submit return request.' });
    }
  });

  // =========================================================================
  // DISPATCH RIDER PORTAL (Strictly Isolated to Assigned Rider)
  // =========================================================================
  app.get('/api/driver/jobs', requireAuth, requireRole('dispatch', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.key, 'commerce')).limit(1);
      const jobs = await db
        .select({
          id: deliveries.id,
          orderId: deliveries.orderId,
          orderNumber: deliveries.orderNumber,
          assignedRiderUid: deliveries.assignedRiderUid,
          assignedRiderName: deliveries.assignedRiderName,
          customerName: deliveries.customerName,
          customerPhone: deliveries.customerPhone,
          deliveryZone: deliveries.deliveryZone,
          address: deliveries.address,
          step: deliveries.step,
          proofType: deliveries.proofType,
          proofNote: deliveries.proofNote,
          issueReport: deliveries.issueReport,
          updatedAt: deliveries.updatedAt,
          createdAt: deliveries.createdAt,
        })
        .from(deliveries)
        .where(
          req.dbUser!.role === 'owneradmin'
            ? undefined
            : eq(deliveries.assignedRiderUid, req.dbUser!.uid),
        )
        .orderBy(desc(deliveries.updatedAt));

      res.json({
        jobs,
        deliveryProofMode: settings?.deliveryProofMode || 'otp_photo',
      });
    } catch (error) {
      console.error('Driver jobs error:', error);
      res.status(500).json({ error: 'Unable to load assigned deliveries.' });
    }
  });

  app.post(
    '/api/driver/jobs/:id/transition',
    requireAuth,
    requireRole('dispatch', 'owneradmin'),
    async (req: AuthRequest, res) => {
      try {
        const deliveryId = Number(req.params.id);
        const { nextStep, proofNote, proofPhotoData } = req.body || {};

        const validSteps = ['assigned', 'picked_up', 'on_the_way', 'delivered'];
        if (!validSteps.includes(nextStep)) {
          return res.status(400).json({ error: 'Invalid delivery step.' });
        }

        const [job] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
        if (!job) return res.status(404).json({ error: 'Delivery job not found.' });

        if (req.dbUser!.role !== 'owneradmin' && job.assignedRiderUid !== req.dbUser!.uid) {
          return res.status(403).json({ error: 'You are not assigned to this delivery.' });
        }

        const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.key, 'commerce')).limit(1);
        const proofMode = settings?.deliveryProofMode || 'otp_photo';

        const [linkedOrder] = await db
          .select()
          .from(orders)
          .where(eq(orders.id, job.orderId))
          .limit(1);

        const cleanOtp = String(proofNote || '').trim();
        const cleanPhoto = String(proofPhotoData || '').trim();

        if (nextStep === 'delivered') {
          const requiresOtp = proofMode === 'otp_photo' || proofMode === 'otp';
          const requiresPhoto = proofMode === 'otp_photo' || proofMode === 'photo';

          if (requiresOtp) {
            if (!/^\d{6}$/.test(cleanOtp)) {
              return res.status(400).json({
                error: 'Enter the customer’s 6-digit Delivery OTP code to confirm handoff.',
              });
            }
            if (linkedOrder?.deliveryOtp) {
              const enteredBuf = Buffer.from(cleanOtp);
              const expectedBuf = Buffer.from(linkedOrder.deliveryOtp);
              if (enteredBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(enteredBuf, expectedBuf)) {
                return res.status(400).json({
                  error: 'Customer Delivery OTP does not match. Ask the customer for their 6-digit OTP code.',
                });
              }
            }
          }

          if (requiresPhoto) {
            if (
              !/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(cleanPhoto) ||
              cleanPhoto.length > 4_500_000
            ) {
              return res.status(400).json({
                error: 'Attach a valid PNG, JPG, or WebP delivery confirmation image (max 3MB).',
              });
            }
          }
        }

        let ensuredOtp = linkedOrder?.deliveryOtp || null;
        if (nextStep === 'on_the_way' && linkedOrder && !ensuredOtp) {
          ensuredOtp = generateDeliveryOtp();
        }

        const [updatedJob] = await db
          .update(deliveries)
          .set({
            step: nextStep,
            proofType: nextStep === 'delivered' ? proofMode : job.proofType,
            proofNote: cleanOtp ? cleanOtp.slice(0, 300) : job.proofNote,
            proofPhotoData: cleanPhoto ? cleanPhoto : job.proofPhotoData,
            updatedAt: new Date(),
          })
          .where(eq(deliveries.id, deliveryId))
          .returning();

        const orderStatus =
          nextStep === 'delivered'
            ? 'delivered'
            : nextStep === 'on_the_way'
              ? 'out_for_delivery'
              : 'ready_for_dispatch';

        await db
          .update(orders)
          .set({
            status: orderStatus,
            deliveryOtp: ensuredOtp || linkedOrder?.deliveryOtp || null,
            deliveredAt: nextStep === 'delivered' ? new Date() : undefined,
            deliveryProofMode: nextStep === 'delivered' ? proofMode : undefined,
            deliveryProofValue: cleanOtp ? cleanOtp.slice(0, 120) : undefined,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, job.orderId));

        if (nextStep === 'on_the_way') {
          const otpLine = ensuredOtp
            ? ` Your 6-digit Delivery OTP is ${ensuredOtp} — share it only with your rider upon handoff.`
            : '';
          await dispatchNotification({
            eventType: 'order.dispatched',
            entityId: job.orderNumber,
            recipientPhone: job.customerPhone,
            recipientEmail: linkedOrder?.customerEmail || null,
            emailSubject: `Raw.hairs Dispatch — Order ${job.orderNumber} is On the Way`,
            dedupeSuffix: 'on_the_way',
            messageBody: `Raw.hairs Dispatch: Rider ${job.assignedRiderName} is on the way to ${job.deliveryZone} with your Order ${job.orderNumber}.${otpLine}`,
          });
        } else if (nextStep === 'delivered') {
          await dispatchNotification({
            eventType: 'order.delivered',
            entityId: job.orderNumber,
            recipientPhone: job.customerPhone,
            recipientEmail: linkedOrder?.customerEmail || null,
            emailSubject: `Raw.hairs — Order ${job.orderNumber} Delivered`,
            notifyAdminEmail: true,
            adminMessageBody: `Order ${job.orderNumber} marked DELIVERED by ${job.assignedRiderName} (${job.deliveryZone}). Proof mode: ${proofMode}.`,
            dedupeSuffix: 'delivered',
            messageBody: `Raw.hairs: Order ${job.orderNumber} has been delivered and confirmed. Enjoy your crown! Note: any return claim must be filed within ${settings?.returnWindowHours || 48} hours.`,
          });
        }

        res.json({ job: updatedJob });
      } catch (error) {
        console.error('Driver transition error:', error);
        res.status(500).json({ error: 'Unable to update delivery status.' });
      }
    },
  );

  app.post(
    '/api/driver/jobs/:id/issue',
    requireAuth,
    requireRole('dispatch', 'owneradmin'),
    async (req: AuthRequest, res) => {
      try {
        const deliveryId = Number(req.params.id);
        const { issueReport } = req.body || {};
        if (!issueReport?.trim()) return res.status(400).json({ error: 'Please describe the delivery issue.' });

        const [job] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
        if (!job) return res.status(404).json({ error: 'Delivery job not found.' });
        if (req.dbUser!.role !== 'owneradmin' && job.assignedRiderUid !== req.dbUser!.uid) {
          return res.status(403).json({ error: 'Forbidden.' });
        }

        const [updated] = await db
          .update(deliveries)
          .set({ issueReport: String(issueReport).trim().slice(0, 500), updatedAt: new Date() })
          .where(eq(deliveries.id, deliveryId))
          .returning();

        res.json({ job: updated });
      } catch (error) {
        console.error('Driver issue error:', error);
        res.status(500).json({ error: 'Unable to save delivery issue.' });
      }
    },
  );

  // =========================================================================
  // ADMIN OPERATIONS CONSOLE (Staff & OwnerAdmin)
  // =========================================================================
  app.get('/api/admin/overview', requireAuth, requireRole('staff', 'owneradmin'), async (_req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      await expireStaleReservations();

      const [
        allCategories,
        allProducts,
        allVariants,
        allOrders,
        allOrderItems,
        allPayments,
        allBookings,
        allQuotations,
        allReturns,
        allDeliveries,
        allServices,
        allUsers,
        allLogs,
        allInvLogs,
        allNotifications,
        activeReservations,
        [settings],
      ] = await Promise.all([
        db.select().from(categories).orderBy(categories.sortOrder),
        db.select().from(products).orderBy(desc(products.id)),
        db.select().from(productVariants).orderBy(productVariants.productId, productVariants.lengthInches),
        db.select().from(orders).orderBy(desc(orders.createdAt)),
        db.select().from(orderItems),
        db.select().from(payments).orderBy(desc(payments.createdAt)),
        db.select().from(bookings).orderBy(desc(bookings.scheduledAt)),
        db.select().from(quotations).orderBy(desc(quotations.createdAt)),
        db.select().from(returns).orderBy(desc(returns.createdAt)),
        db.select().from(deliveries).orderBy(desc(deliveries.updatedAt)),
        db.select().from(services).orderBy(services.id),
        db.select().from(users).orderBy(desc(users.createdAt)),
        db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(60),
        db.select().from(inventoryLogs).orderBy(desc(inventoryLogs.createdAt)).limit(60),
        db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(60),
        db
          .select()
          .from(stockReservations)
          .where(and(eq(stockReservations.status, 'active'), gt(stockReservations.expiresAt, new Date()))),
        db.select().from(storeSettings).where(eq(storeSettings.key, 'commerce')).limit(1),
      ]);

      const paidRevenueNgn = allOrders
        .filter((o) => o.paymentStatus === 'paid')
        .reduce((acc, o) => acc + o.totalNgn, 0);

      res.json({
        metrics: {
          paidRevenueNgn,
          totalOrders: allOrders.length,
          pendingApproval: allOrders.filter((o) => o.status === 'paid').length,
          pendingTransferConfirmations: allOrders.filter((o) => o.status === 'awaiting_transfer_confirmation').length,
          activeReservations: activeReservations.length,
          pendingBookings: allBookings.filter((b) => b.status === 'pending').length,
          openReturns: allReturns.filter((r) => ['submitted', 'under_review'].includes(r.status)).length,
          openQuotations: allQuotations.filter((q) => q.status === 'requested').length,
          lowStockVariants: allVariants.filter((v) => v.totalStock <= 3).length,
        },
        categories: allCategories,
        products: allProducts.map((p) => ({
          ...p,
          variants: allVariants.filter((v) => v.productId === p.id),
        })),
        orders: allOrders.map((o) => ({
          ...o,
          items: allOrderItems.filter((it) => it.orderId === o.id),
        })),
        payments: allPayments,
        bookings: allBookings,
        quotations: allQuotations,
        returns: allReturns,
        deliveries: allDeliveries,
        services: allServices,
        users: allUsers.slice(0, 50),
        riders: allUsers.filter((u) => u.role === 'dispatch' && u.isActive),
        auditLogs: allLogs,
        inventoryLogs: allInvLogs,
        notifications: allNotifications,
        activeReservations,
        settings,
        notificationChannels: {
          resendConfigured: Boolean(process.env.RESEND_API_KEY),
          resendFrom: process.env.RESEND_FROM_EMAIL || 'Raw.hairs <onboarding@resend.dev>',
          adminAlertEmail: process.env.ADMIN_ALERT_EMAIL || 'boopuddin64@gmail.com',
          whatsappConfigured: Boolean(process.env.WHATSAPP_API_KEY && process.env.WHATSAPP_PHONE_NUMBER_ID),
        },
      });
    } catch (error) {
      console.error('Admin overview error:', error);
      res.status(500).json({ error: 'Unable to load admin operations data.' });
    }
  });

  // Admin: Product & Variant CRUD
  app.post('/api/admin/products', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const { name, categorySlug, texture, origin, description, imageUrl, basePriceNgn, basePriceUsd, featured, variants } =
        req.body || {};

      if (!name?.trim() || !categorySlug?.trim() || !description?.trim()) {
        return res.status(400).json({ error: 'Product name, category, and description are required.' });
      }

      const slug = `${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}-${crypto.randomBytes(2).toString('hex')}`;

      const defaultImageByCat =
        categorySlug === 'hair-care'
          ? '/src/assets/images/care_silk_elixir_1795590466182.jpg'
          : categorySlug === 'styling-tools'
            ? '/src/assets/images/tool_titanium_straightener_1795590464705.jpg'
            : '/catalogue/bone.jpg';

      const [created] = await db
        .insert(products)
        .values({
          slug,
          name: name.trim(),
          categorySlug: categorySlug.trim(),
          texture: (texture || categorySlug).trim(),
          origin: (origin || 'Single-Donor Raw').trim(),
          description: description.trim(),
          imageUrl: imageUrl?.trim() || defaultImageByCat,
          gallery: [imageUrl?.trim() || defaultImageByCat],
          basePriceNgn: Number(basePriceNgn) || 120000,
          basePriceUsd: Number(basePriceUsd) || 80,
          featured: Boolean(featured),
          isActive: true,
        })
        .returning();

      const isNonHair = ['hair-care', 'styling-tools'].includes(categorySlug.trim());
      const variantList =
        Array.isArray(variants) && variants.length > 0
          ? variants
          : [
              {
                sku: makeCode('RH'),
                lengthInches: isNonHair ? 0 : 18,
                laceType: isNonHair ? 'Standard Edition' : '5x5 HD Closure',
                colorShade: isNonHair ? 'Signature Rose' : 'Natural Black',
                priceNgn: Number(basePriceNgn) || 120000,
                priceUsd: Number(basePriceUsd) || 80,
                totalStock: 5,
              },
            ];

      for (const v of variantList) {
        const parsedLen =
          v.lengthInches !== undefined && v.lengthInches !== null
            ? Math.max(0, Number(v.lengthInches))
            : isNonHair
              ? 0
              : 18;
        const [insertedVar] = await db
          .insert(productVariants)
          .values({
            productId: created.id,
            sku: String(v.sku || makeCode('RH')).trim(),
            lengthInches: Number.isFinite(parsedLen) ? parsedLen : 0,
            laceType: String(v.laceType || (isNonHair ? 'Standard Edition' : '3-Bundle Deal')),
            colorShade: String(v.colorShade || (isNonHair ? 'Signature Rose' : 'Natural Black')),
            priceNgn: Number(v.priceNgn) || created.basePriceNgn,
            priceUsd: Number(v.priceUsd) || created.basePriceUsd,
            totalStock: Math.max(0, Number(v.totalStock) || 0),
          })
          .returning();

        await db.insert(inventoryLogs).values({
          variantId: insertedVar.id,
          delta: insertedVar.totalStock,
          reason: 'initial_product_create',
          referenceCode: insertedVar.sku,
          actorUid: req.dbUser!.uid,
        });
      }

      await writeAuditLog({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        action: 'product.created',
        entityType: 'product',
        entityId: String(created.id),
        details: { name: created.name },
      });

      res.status(201).json({ product: created });
    } catch (error) {
      console.error('Admin create product error:', error);
      res.status(500).json({ error: 'Unable to create product.' });
    }
  });

  app.patch('/api/admin/products/:id', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { name, description, basePriceNgn, basePriceUsd, featured, isActive } = req.body || {};
      const [updated] = await db
        .update(products)
        .set({
          ...(typeof name === 'string' ? { name: name.trim() } : {}),
          ...(typeof description === 'string' ? { description: description.trim() } : {}),
          ...(basePriceNgn !== undefined ? { basePriceNgn: Number(basePriceNgn) } : {}),
          ...(basePriceUsd !== undefined ? { basePriceUsd: Number(basePriceUsd) } : {}),
          ...(featured !== undefined ? { featured: Boolean(featured) } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      await writeAuditLog({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        action: 'product.updated',
        entityType: 'product',
        entityId: String(id),
      });

      res.json({ product: updated });
    } catch (error) {
      console.error('Admin update product error:', error);
      res.status(500).json({ error: 'Unable to update product.' });
    }
  });

  app.post('/api/admin/variants/:id/stock', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const delta = Number(req.body?.delta) || 0;
      const reason = String(req.body?.reason || 'manual_adjustment').trim();

      const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, id)).limit(1);
      if (!variant) return res.status(404).json({ error: 'Variant not found.' });

      const nextStock = Math.max(0, variant.totalStock + delta);
      const [updated] = await db
        .update(productVariants)
        .set({ totalStock: nextStock })
        .where(eq(productVariants.id, id))
        .returning();

      await db.insert(inventoryLogs).values({
        variantId: id,
        delta,
        reason,
        referenceCode: variant.sku,
        actorUid: req.dbUser!.uid,
      });

      await writeAuditLog({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        action: 'inventory.adjusted',
        entityType: 'variant',
        entityId: variant.sku,
        details: { delta, nextStock, reason },
      });

      res.json({ variant: updated });
    } catch (error) {
      console.error('Admin stock adjust error:', error);
      res.status(500).json({ error: 'Unable to adjust stock.' });
    }
  });

  // Admin: Categories & Services CRUD
  app.post('/api/admin/categories', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const { name, description } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'Category name required.' });
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const [created] = await db
        .insert(categories)
        .values({ slug, name: name.trim(), description: description?.trim() || null, sortOrder: 10 })
        .returning();
      res.status(201).json({ category: created });
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({ error: 'Unable to create category.' });
    }
  });

  app.post('/api/admin/services', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const { name, description, priceNgn, durationMinutes } = req.body || {};
      if (!name?.trim() || !description?.trim()) {
        return res.status(400).json({ error: 'Service name and description are required.' });
      }
      const slug = `${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}-${crypto.randomBytes(2).toString('hex')}`;
      const [created] = await db
        .insert(services)
        .values({
          slug,
          name: name.trim(),
          description: description.trim(),
          priceNgn: priceNgn ? Number(priceNgn) : null,
          durationMinutes: Number(durationMinutes) || 90,
        })
        .returning();
      res.status(201).json({ service: created });
    } catch (error) {
      console.error('Create service error:', error);
      res.status(500).json({ error: 'Unable to create service.' });
    }
  });

  // Admin: Strict Order State Machine + Dispatch Assignment
  app.post('/api/admin/orders/:id/transition', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const orderId = Number(req.params.id);
      const { nextStatus, riderUid } = req.body || {};

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found.' });

      const allowed = ORDER_TRANSITIONS[order.status] || [];
      if (!allowed.includes(nextStatus)) {
        return res.status(409).json({
          error: `Invalid transition from ${order.status} to ${nextStatus}.`,
        });
      }

      if (nextStatus === 'approved' && order.paymentStatus !== 'paid') {
        return res.status(409).json({
          error: 'Order approval is blocked until Paystack or Bank Transfer payment is confirmed.',
        });
      }

      let assignedRiderName = '';
      const resolvedRiderUid = riderUid || order.assignedRiderUid;
      if (['ready_for_dispatch', 'out_for_delivery'].includes(nextStatus)) {
        if (!resolvedRiderUid) {
          return res.status(400).json({ error: 'Please assign a Rivers State dispatch rider first.' });
        }
        const [rider] = await db.select().from(users).where(eq(users.uid, resolvedRiderUid)).limit(1);
        assignedRiderName = rider?.fullName || rider?.email || 'Port Harcourt Rider';
      }

      const needsOtp = ['approved', 'ready_for_dispatch', 'out_for_delivery'].includes(nextStatus);
      const nextOtp = needsOtp ? order.deliveryOtp || generateDeliveryOtp() : order.deliveryOtp;

      const [updated] = await db
        .update(orders)
        .set({
          status: nextStatus,
          assignedRiderUid: resolvedRiderUid || order.assignedRiderUid,
          deliveryOtp: nextOtp,
          deliveredAt: nextStatus === 'delivered' ? new Date() : order.deliveredAt,
          paymentStatus: nextStatus === 'refunded' ? 'refunded' : order.paymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      if (resolvedRiderUid && ['ready_for_dispatch', 'out_for_delivery'].includes(nextStatus)) {
        await db
          .insert(deliveries)
          .values({
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            assignedRiderUid: resolvedRiderUid,
            assignedRiderName,
            customerName: updated.customerName,
            customerPhone: updated.customerPhone,
            deliveryZone: updated.deliveryZone,
            address: updated.address,
            step: nextStatus === 'out_for_delivery' ? 'on_the_way' : 'assigned',
          })
          .onConflictDoUpdate({
            target: deliveries.orderId,
            set: {
              assignedRiderUid: resolvedRiderUid,
              assignedRiderName,
              step: nextStatus === 'out_for_delivery' ? 'on_the_way' : 'assigned',
              updatedAt: new Date(),
            },
          });
      }

      if (nextStatus === 'approved') {
        await dispatchNotification({
          eventType: 'order.approved',
          entityId: updated.orderNumber,
          recipientPhone: updated.customerPhone,
          recipientEmail: updated.customerEmail,
          emailSubject: `Raw.hairs — Order ${updated.orderNumber} Approved`,
          dedupeSuffix: 'approved',
          messageBody: `Raw.hairs: Order ${updated.orderNumber} is approved and entering quality inspection & silk packaging. Your 6-digit Delivery OTP is ${updated.deliveryOtp}.`,
        });
      } else if (nextStatus === 'out_for_delivery') {
        await dispatchNotification({
          eventType: 'order.dispatched',
          entityId: updated.orderNumber,
          recipientPhone: updated.customerPhone,
          recipientEmail: updated.customerEmail,
          emailSubject: `Raw.hairs Dispatch — Order ${updated.orderNumber} Dispatched`,
          dedupeSuffix: 'dispatched',
          messageBody: `Raw.hairs: Order ${updated.orderNumber} is now out for delivery to ${updated.deliveryZone} with ${assignedRiderName}. Share your 6-digit Delivery OTP (${updated.deliveryOtp}) only with your rider at handoff.`,
        });
      }

      await writeAuditLog({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        action: `order.${nextStatus}`,
        entityType: 'order',
        entityId: updated.orderNumber,
        details: { previousStatus: order.status, riderUid: resolvedRiderUid || null },
      });

      res.json({ order: updated });
    } catch (error) {
      console.error('Order transition error:', error);
      res.status(500).json({ error: 'Unable to transition order state.' });
    }
  });

  // Admin: Verify & Confirm Direct Bank Transfer Receipt + Transaction Code
  app.post('/api/admin/orders/:id/confirm-bank-transfer', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const orderId = Number(req.params.id);
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found.' });

      if (order.paymentMethod !== 'bank_transfer') {
        return res.status(409).json({ error: 'Order is not a Direct Bank Transfer order.' });
      }
      if (order.paymentStatus === 'paid') {
        return res.status(409).json({ error: 'Bank transfer has already been confirmed.' });
      }
      if (!order.bankTransactionCode) {
        return res.status(409).json({ error: 'Customer has not submitted a transaction code and receipt yet.' });
      }

      const updated = await db.transaction(async (tx) => {
        const committedAlready = await tx
          .select()
          .from(stockReservations)
          .where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, 'committed')))
          .limit(1);

        if (committedAlready.length === 0) {
          const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          for (const item of items) {
            await tx
              .update(productVariants)
              .set({ totalStock: sql`GREATEST(0, ${productVariants.totalStock} - ${item.quantity})` })
              .where(eq(productVariants.id, item.variantId));

            await tx.insert(inventoryLogs).values({
              variantId: item.variantId,
              delta: -item.quantity,
              reason: 'bank_transfer_confirmed',
              referenceCode: order.orderNumber,
              actorUid: req.dbUser!.uid,
            });
          }

          await tx
            .update(stockReservations)
            .set({ status: 'committed' })
            .where(eq(stockReservations.orderId, order.id));
        }

        const [updatedOrder] = await tx
          .update(orders)
          .set({
            paymentStatus: 'paid',
            status: 'approved',
            deliveryOtp: order.deliveryOtp || generateDeliveryOtp(),
            bankTransferVerifiedBy: req.dbUser!.email,
            bankTransferVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();

        const transferRef = `BT-${order.orderNumber}`;
        await tx
          .insert(payments)
          .values({
            orderId: order.id,
            reference: transferRef,
            provider: 'bank_transfer',
            amountNgn: order.totalNgn,
            status: 'paid',
            channel: 'bank_transfer',
            rawPayload: {
              transactionCode: order.bankTransactionCode,
              verifiedBy: req.dbUser!.email,
            },
            verifiedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: payments.reference,
            set: {
              status: 'paid',
              verifiedAt: new Date(),
              rawPayload: {
                transactionCode: order.bankTransactionCode,
                verifiedBy: req.dbUser!.email,
              },
            },
          });

        return updatedOrder;
      });

      await dispatchNotification({
        eventType: 'payment.verified',
        entityId: updated.orderNumber,
        recipientPhone: updated.customerPhone,
        recipientEmail: updated.customerEmail,
        emailSubject: `Raw.hairs — Bank Transfer Confirmed (${updated.orderNumber})`,
        dedupeSuffix: `bt-confirmed-${updated.orderNumber}`,
        messageBody: `Raw.hairs: Your bank transfer (${updated.bankTransactionCode}) for Order ${updated.orderNumber} has been confirmed! Your order is approved for dispatch. Your 6-digit Delivery OTP is ${updated.deliveryOtp} — share it only with your rider at handoff.`,
      });

      await writeAuditLog({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        action: 'order.bank_transfer_confirmed',
        entityType: 'order',
        entityId: updated.orderNumber,
        details: { transactionCode: updated.bankTransactionCode },
      });

      res.json({ ok: true, order: updated });
    } catch (error) {
      console.error('Confirm bank transfer error:', error);
      res.status(500).json({ error: 'Unable to confirm bank transfer.' });
    }
  });

  // Admin: Reject Bank Transfer & Release Reserved Stock
  app.post('/api/admin/orders/:id/reject-bank-transfer', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const orderId = Number(req.params.id);
      const reason = String(req.body?.reason || 'Transfer could not be matched in bank statement.').trim().slice(0, 240);

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found.' });
      if (order.paymentMethod !== 'bank_transfer') {
        return res.status(409).json({ error: 'Order is not a Direct Bank Transfer order.' });
      }
      if (order.paymentStatus === 'paid') {
        return res.status(409).json({ error: 'Cannot reject a transfer that is already confirmed paid.' });
      }

      const updated = await db.transaction(async (tx) => {
        await tx
          .update(stockReservations)
          .set({ status: 'released' })
          .where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, 'active')));

        const [updatedOrder] = await tx
          .update(orders)
          .set({
            paymentStatus: 'failed',
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();

        await tx
          .update(payments)
          .set({ status: 'failed', rawPayload: { transactionCode: order.bankTransactionCode, rejectionReason: reason } })
          .where(eq(payments.reference, `BT-${order.orderNumber}`));

        return updatedOrder;
      });

      await dispatchNotification({
        eventType: 'transfer.rejected',
        entityId: updated.orderNumber,
        recipientPhone: updated.customerPhone,
        recipientEmail: updated.customerEmail,
        emailSubject: `Raw.hairs — Bank Transfer Verification Issue (${updated.orderNumber})`,
        dedupeSuffix: `bt-rejected-${updated.orderNumber}`,
        messageBody: `Raw.hairs: We could not confirm your bank transfer for Order ${updated.orderNumber} (${reason}). Please contact support or place a fresh order.`,
      });

      await writeAuditLog({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        action: 'order.bank_transfer_rejected',
        entityType: 'order',
        entityId: updated.orderNumber,
        details: { reason, transactionCode: order.bankTransactionCode },
      });

      res.json({ ok: true, order: updated });
    } catch (error) {
      console.error('Reject bank transfer error:', error);
      res.status(500).json({ error: 'Unable to reject bank transfer.' });
    }
  });

  // Admin: Bookings, Quotations, Returns
  app.post('/api/admin/bookings/:id/status', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body || {};
      if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid booking status.' });
      }
      const [updated] = await db
        .update(bookings)
        .set({ status, updatedAt: new Date() })
        .where(eq(bookings.id, id))
        .returning();

      if (updated) {
        let bookingEmail: string | null = null;
        if (updated.userUid) {
          const [bookingUser] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.uid, updated.userUid))
            .limit(1);
          bookingEmail = bookingUser?.email || null;
        }
        await dispatchNotification({
          eventType: 'booking.updated',
          entityId: updated.bookingCode,
          recipientPhone: updated.customerPhone,
          recipientEmail: bookingEmail,
          emailSubject: `Raw.hairs Studio — Booking ${updated.bookingCode} ${status.toUpperCase()}`,
          dedupeSuffix: status,
          messageBody: `Raw.hairs Studio: Your booking ${updated.bookingCode} (${updated.serviceName}) status is now ${status.toUpperCase()}.`,
        });
        await writeAuditLog({
          actorUid: req.dbUser!.uid,
          actorEmail: req.dbUser!.email,
          actorRole: req.dbUser!.role,
          action: 'booking.updated',
          entityType: 'booking',
          entityId: updated.bookingCode,
          details: { status },
        });
      }

      res.json({ booking: updated });
    } catch (error) {
      console.error('Admin booking update error:', error);
      res.status(500).json({ error: 'Unable to update booking.' });
    }
  });

  app.post('/api/admin/quotations/:id/quote', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const itemsAmountUsd = Math.max(0, Number(req.body?.itemsAmountUsd) || 0);
      const shippingFeeUsd = Math.max(0, Number(req.body?.shippingFeeUsd) || 0);
      const exchangeRateNgn = Math.max(100, Number(req.body?.exchangeRateNgn) || 1600);
      const totalUsd = itemsAmountUsd + shippingFeeUsd;

      const [updated] = await db
        .update(quotations)
        .set({
          itemsAmountUsd,
          shippingFeeUsd,
          totalUsd,
          exchangeRateNgn,
          adminNotes: req.body?.adminNotes ? String(req.body.adminNotes).trim() : null,
          status: 'quoted',
          updatedAt: new Date(),
        })
        .where(eq(quotations.id, id))
        .returning();

      if (updated) {
        await dispatchNotification({
          eventType: 'quotation.quoted',
          entityId: updated.quoteCode,
          recipientPhone: updated.customerPhone,
          recipientEmail: updated.customerEmail,
          emailSubject: `Raw.hairs International — Quote ${updated.quoteCode} Ready ($${updated.totalUsd} USD)`,
          dedupeSuffix: 'quoted',
          messageBody: `Raw.hairs International: Your quote ${updated.quoteCode} is ready ($${updated.totalUsd} USD including DHL/FedEx to ${updated.country}). Sign in to accept and pay.`,
        });
        await writeAuditLog({
          actorUid: req.dbUser!.uid,
          actorEmail: req.dbUser!.email,
          actorRole: req.dbUser!.role,
          action: 'quotation.quoted',
          entityType: 'quotation',
          entityId: updated.quoteCode,
          details: { totalUsd },
        });
      }

      res.json({ quotation: updated });
    } catch (error) {
      console.error('Admin quote error:', error);
      res.status(500).json({ error: 'Unable to send quotation.' });
    }
  });

  app.post('/api/admin/returns/:id/decision', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { status, adminDecisionNote } = req.body || {};
      if (!['under_review', 'approved', 'rejected', 'refunded'].includes(status)) {
        return res.status(400).json({ error: 'Invalid return decision.' });
      }

      const [updated] = await db
        .update(returns)
        .set({
          status,
          adminDecisionNote: adminDecisionNote ? String(adminDecisionNote).trim() : null,
          updatedAt: new Date(),
        })
        .where(eq(returns.id, id))
        .returning();

      if (updated) {
        await writeAuditLog({
          actorUid: req.dbUser!.uid,
          actorEmail: req.dbUser!.email,
          actorRole: req.dbUser!.role,
          action: 'return.decision',
          entityType: 'return',
          entityId: updated.returnCode,
          details: { status },
        });
      }

      res.json({ returnClaim: updated });
    } catch (error) {
      console.error('Admin return decision error:', error);
      res.status(500).json({ error: 'Unable to update return decision.' });
    }
  });

  // Admin: Paginated & Filterable User Directory (Staff & OwnerAdmin)
  app.get('/api/admin/users', requireAuth, requireRole('staff', 'owneradmin'), async (req: AuthRequest, res) => {
    try {
      const searchRaw = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
      const roleFilter = typeof req.query.role === 'string' ? req.query.role : 'all';
      const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(50, Math.max(5, Number.parseInt(String(req.query.pageSize || '12'), 10) || 12));

      const conditions = [];
      if (roleFilter !== 'all' && ['customer', 'dispatch', 'staff', 'owneradmin'].includes(roleFilter)) {
        conditions.push(eq(users.role, roleFilter));
      }
      if (statusFilter === 'active') {
        conditions.push(eq(users.isActive, true));
      } else if (statusFilter === 'suspended') {
        conditions.push(eq(users.isActive, false));
      }
      if (searchRaw) {
        const escaped = searchRaw.replace(/[%_\\]/g, '\\$&');
        const pattern = `%${escaped}%`;
        conditions.push(or(ilike(users.email, pattern), ilike(users.fullName, pattern), ilike(users.phone, pattern)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [matchedUsers, totalRows, groupedCounts] = await Promise.all([
        db
          .select({
            id: users.id,
            uid: users.uid,
            email: users.email,
            fullName: users.fullName,
            phone: users.phone,
            role: users.role,
            defaultState: users.defaultState,
            defaultZone: users.defaultZone,
            defaultAddress: users.defaultAddress,
            isActive: users.isActive,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(whereClause)
          .orderBy(
            sql`CASE ${users.role} WHEN 'owneradmin' THEN 0 WHEN 'staff' THEN 1 WHEN 'dispatch' THEN 2 ELSE 3 END`,
            desc(users.createdAt),
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ total: count() }).from(users).where(whereClause),
        db
          .select({
            role: users.role,
            isActive: users.isActive,
            total: count(),
          })
          .from(users)
          .groupBy(users.role, users.isActive),
      ]);

      const counts = {
        all: 0,
        customer: 0,
        dispatch: 0,
        staff: 0,
        owneradmin: 0,
        active: 0,
        suspended: 0,
      };
      for (const row of groupedCounts) {
        const n = Number(row.total) || 0;
        counts.all += n;
        if (row.role === 'customer' || row.role === 'dispatch' || row.role === 'staff' || row.role === 'owneradmin') {
          counts[row.role] += n;
        }
        if (row.isActive) counts.active += n;
        else counts.suspended += n;
      }

      const total = Number(totalRows[0]?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      res.json({
        users: matchedUsers,
        total,
        page: Math.min(page, totalPages),
        pageSize,
        totalPages,
        counts,
      });
    } catch (error) {
      console.error('Admin users list error:', error);
      res.status(500).json({ error: 'Unable to load users directory.' });
    }
  });

  // Admin: Pre-Register Driver, Staff, or Customer by Email (OwnerAdmin Only)
  app.post('/api/admin/users', requireAuth, requireRole('owneradmin'), async (req: AuthRequest, res) => {
    try {
      const { email, fullName, phone, role, defaultZone } = req.body || {};
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 160) : '';
      const cleanName = typeof fullName === 'string' ? fullName.trim().slice(0, 120) : '';
      const cleanPhone = typeof phone === 'string' ? phone.trim().slice(0, 30) : '';
      const assignedRole = typeof role === 'string' && ['customer', 'dispatch', 'staff', 'owneradmin'].includes(role)
        ? role
        : 'dispatch';
      const cleanZone = typeof defaultZone === 'string' && defaultZone.trim() ? defaultZone.trim().slice(0, 40) : 'ph-gra';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }
      if (cleanName.length < 2) {
        return res.status(400).json({ error: 'Enter the team member’s full name.' });
      }

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${cleanEmail})`)
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({
          error: 'An account with this email already exists. Update their role from the directory below.',
        });
      }

      const pendingUid = `pending-${crypto.randomBytes(6).toString('hex')}`;
      const [created] = await db
        .insert(users)
        .values({
          uid: pendingUid,
          email: cleanEmail,
          fullName: cleanName,
          phone: cleanPhone || null,
          role: assignedRole,
          defaultState: 'Rivers',
          defaultZone: cleanZone,
          isActive: true,
        })
        .returning();

      await writeAuditLog({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        action: 'rbac.user_provisioned',
        entityType: 'user',
        entityId: created.uid,
        details: { email: cleanEmail, role: assignedRole },
      });

      const roleLabel =
        assignedRole === 'dispatch'
          ? 'Dispatch Rider'
          : assignedRole === 'staff'
            ? 'Operations Staff'
            : assignedRole === 'owneradmin'
              ? 'Owner Admin'
              : 'Customer';

      await dispatchNotification({
        eventType: 'team.invited',
        entityId: cleanEmail,
        recipientEmail: cleanEmail,
        recipientPhone: cleanPhone || undefined,
        notifyAdminEmail: false,
        emailSubject: `Raw.hairs — Your ${roleLabel} Access Is Ready`,
        messageBody: `Hello ${cleanName}, your Raw.hairs ${roleLabel} access is ready. Visit the Account page and create an account or sign in using ${cleanEmail} to activate your workspace.`,
      });

      res.status(201).json({ user: created });
    } catch (error) {
      console.error('Admin user provision error:', error);
      res.status(500).json({ error: 'Unable to add team member.' });
    }
  });

  // Admin: Staff & RBAC Role Management (OwnerAdmin Only)
  app.patch('/api/admin/users/:uid/role', requireAuth, requireRole('owneradmin'), async (req: AuthRequest, res) => {
    try {
      const targetUid = String(req.params.uid);
      const { role, isActive } = req.body || {};
      if (role && !['customer', 'dispatch', 'staff', 'owneradmin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role.' });
      }
      if (targetUid === req.dbUser!.uid && (isActive === false || (role && role !== 'owneradmin'))) {
        return res.status(400).json({ error: 'You cannot suspend or demote your own active owneradmin account.' });
      }

      const [updated] = await db
        .update(users)
        .set({
          ...(role ? { role } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.uid, targetUid))
        .returning();

      if (!updated) return res.status(404).json({ error: 'User not found.' });

      await writeAuditLog({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        action: 'rbac.role_updated',
        entityType: 'user',
        entityId: targetUid,
        details: { role: updated.role, isActive: updated.isActive },
      });

      res.json({ user: updated });
    } catch (error) {
      console.error('RBAC update error:', error);
      res.status(500).json({ error: 'Unable to update staff role.' });
    }
  });

  // Admin: Store Settings (Rivers State Zones, POD, Proof Mode, Returns, WhatsApp, Staff Matrix)
  app.patch('/api/admin/settings', requireAuth, requireRole('owneradmin'), async (req: AuthRequest, res) => {
    try {
      const payload = req.body || {};
      const [current] = await db.select().from(storeSettings).where(eq(storeSettings.key, 'commerce')).limit(1);
      if (!current) return res.status(404).json({ error: 'Settings record missing.' });

      const [updated] = await db
        .update(storeSettings)
        .set({
          riversZones: Array.isArray(payload.riversZones) ? payload.riversZones : current.riversZones,
          interstateZones: Array.isArray(payload.interstateZones) ? payload.interstateZones : current.interstateZones,
          podEnabled: payload.podEnabled !== undefined ? Boolean(payload.podEnabled) : current.podEnabled,
          podAllowedZones: Array.isArray(payload.podAllowedZones) ? payload.podAllowedZones : current.podAllowedZones,
          podMaxOrderNgn:
            payload.podMaxOrderNgn !== undefined ? Math.max(0, Number(payload.podMaxOrderNgn)) : current.podMaxOrderNgn,
          bankTransferEnabled:
            payload.bankTransferEnabled !== undefined
              ? Boolean(payload.bankTransferEnabled)
              : current.bankTransferEnabled,
          bankName:
            typeof payload.bankName === 'string' && payload.bankName.trim()
              ? payload.bankName.trim().slice(0, 120)
              : current.bankName,
          bankAccountNumber:
            typeof payload.bankAccountNumber === 'string' && payload.bankAccountNumber.trim()
              ? payload.bankAccountNumber.trim().slice(0, 40)
              : current.bankAccountNumber,
          bankAccountName:
            typeof payload.bankAccountName === 'string' && payload.bankAccountName.trim()
              ? payload.bankAccountName.trim().slice(0, 140)
              : current.bankAccountName,
          bankTransferInstructions:
            typeof payload.bankTransferInstructions === 'string' && payload.bankTransferInstructions.trim()
              ? payload.bankTransferInstructions.trim().slice(0, 600)
              : current.bankTransferInstructions,
          deliveryProofMode: ['otp_photo', 'otp', 'photo', 'rider_confirm'].includes(payload.deliveryProofMode)
            ? payload.deliveryProofMode
            : current.deliveryProofMode,
          returnWindowHours:
            payload.returnWindowHours !== undefined
              ? Math.max(1, Number(payload.returnWindowHours))
              : current.returnWindowHours,
          returnEligibilityNotes:
            typeof payload.returnEligibilityNotes === 'string'
              ? payload.returnEligibilityNotes.trim()
              : current.returnEligibilityNotes,
          whatsappProvider:
            typeof payload.whatsappProvider === 'string' ? payload.whatsappProvider : current.whatsappProvider,
          whatsappEnabled:
            payload.whatsappEnabled !== undefined ? Boolean(payload.whatsappEnabled) : current.whatsappEnabled,
          staffPermissions: payload.staffPermissions || current.staffPermissions,
          updatedAt: new Date(),
        })
        .where(eq(storeSettings.key, 'commerce'))
        .returning();

      await writeAuditLog({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        action: 'settings.updated',
        entityType: 'store_settings',
        entityId: 'commerce',
      });

      res.json({ settings: updated });
    } catch (error) {
      console.error('Admin settings error:', error);
      res.status(500).json({ error: 'Unable to update store settings.' });
    }
  });

  // Mount Vite Dev Middleware or Serve Static Production Build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output missing.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Raw.hairs server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Raw.hairs server:', err);
  process.exit(1);
});
