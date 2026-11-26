import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface RiversZoneRule {
  id: string;
  name: string;
  feeNgn: number;
  etaText: string;
  podEligible: boolean;
}

export interface InterstateZoneRule {
  id: string;
  name: string;
  states: string[];
  feeNgn: number;
  etaText: string;
}

export interface StaffPermissionMatrix {
  manageProducts: boolean;
  manageOrders: boolean;
  manageBookings: boolean;
  manageReturns: boolean;
  manageQuotations: boolean;
  manageDispatch: boolean;
  viewFinancials: boolean;
}

export interface QuotationItemRequest {
  productName: string;
  texture: string;
  lengthInches: number;
  quantity: number;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  phone: text('phone'),
  role: text('role').notNull().default('customer'), // 'customer' | 'dispatch' | 'staff' | 'owneradmin'
  permissions: jsonb('permissions').$type<StaffPermissionMatrix>(),
  defaultState: text('default_state').default('Rivers'),
  defaultZone: text('default_zone').default('ph-gra'),
  defaultAddress: text('default_address'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  categorySlug: text('category_slug').notNull(),
  texture: text('texture').notNull(),
  origin: text('origin').notNull().default('Single-Donor Raw'),
  description: text('description').notNull(),
  imageUrl: text('image_url').notNull(),
  gallery: jsonb('gallery').$type<string[]>().notNull().default([]),
  basePriceNgn: integer('base_price_ngn').notNull(),
  basePriceUsd: integer('base_price_usd').notNull(),
  featured: boolean('featured').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productVariants = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  sku: text('sku').notNull().unique(),
  lengthInches: integer('length_inches').notNull(),
  laceType: text('lace_type').notNull(),
  colorShade: text('color_shade').notNull().default('Natural Black'),
  priceNgn: integer('price_ngn').notNull(),
  priceUsd: integer('price_usd').notNull(),
  totalStock: integer('total_stock').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});

export const stockReservations = pgTable('stock_reservations', {
  id: serial('id').primaryKey(),
  sessionToken: text('session_token').notNull(),
  orderId: integer('order_id'),
  variantId: integer('variant_id')
    .references(() => productVariants.id, { onDelete: 'cascade' })
    .notNull(),
  quantity: integer('quantity').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'committed' | 'expired' | 'released'
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inventoryLogs = pgTable('inventory_logs', {
  id: serial('id').primaryKey(),
  variantId: integer('variant_id')
    .references(() => productVariants.id, { onDelete: 'cascade' })
    .notNull(),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  referenceCode: text('reference_code'),
  actorUid: text('actor_uid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  userUid: text('user_uid'),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone').notNull(),
  state: text('state').notNull().default('Rivers'),
  deliveryZone: text('delivery_zone').notNull(),
  city: text('city').notNull(),
  address: text('address').notNull(),
  instructions: text('instructions'),
  currency: text('currency').notNull().default('NGN'),
  subtotalNgn: integer('subtotal_ngn').notNull(),
  deliveryFeeNgn: integer('delivery_fee_ngn').notNull(),
  totalNgn: integer('total_ngn').notNull(),
  paymentMethod: text('payment_method').notNull(), // 'paystack' | 'bank_transfer'
  paymentStatus: text('payment_status').notNull().default('pending'), // 'pending' | 'awaiting_confirmation' | 'paid' | 'failed' | 'refunded'
  paystackReference: text('paystack_reference').unique(),
  bankTransactionCode: text('bank_transaction_code'),
  bankTransferReceipt: text('bank_transfer_receipt'),
  bankTransferSubmittedAt: timestamp('bank_transfer_submitted_at'),
  bankTransferVerifiedBy: text('bank_transfer_verified_by'),
  bankTransferVerifiedAt: timestamp('bank_transfer_verified_at'),
  status: text('status').notNull().default('pending_payment'),
  assignedRiderUid: text('assigned_rider_uid'),
  deliveryOtp: text('delivery_otp'),
  deliveryProofMode: text('delivery_proof_mode'),
  deliveryProofValue: text('delivery_proof_value'),
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id').notNull(),
  variantId: integer('variant_id').notNull(),
  productName: text('product_name').notNull(),
  sku: text('sku').notNull(),
  lengthInches: integer('length_inches').notNull(),
  laceType: text('lace_type').notNull(),
  unitPriceNgn: integer('unit_price_ngn').notNull(),
  quantity: integer('quantity').notNull(),
  lineTotalNgn: integer('line_total_ngn').notNull(),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  reference: text('reference').notNull().unique(),
  provider: text('provider').notNull().default('paystack'),
  amountNgn: integer('amount_ngn').notNull(),
  status: text('status').notNull(),
  channel: text('channel'),
  webhookEventId: text('webhook_event_id'),
  rawPayload: jsonb('raw_payload'),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deliveries = pgTable('deliveries', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  orderNumber: text('order_number').notNull(),
  assignedRiderUid: text('assigned_rider_uid').notNull(),
  assignedRiderName: text('assigned_rider_name').notNull(),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  deliveryZone: text('delivery_zone').notNull(),
  address: text('address').notNull(),
  step: text('step').notNull().default('assigned'), // 'assigned' | 'picked_up' | 'on_the_way' | 'delivered'
  proofType: text('proof_type'),
  proofNote: text('proof_note'),
  proofPhotoData: text('proof_photo_data'),
  issueReport: text('issue_report'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  priceNgn: integer('price_ngn'),
  durationMinutes: integer('duration_minutes').notNull().default(90),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  bookingCode: text('booking_code').notNull().unique(),
  serviceId: integer('service_id')
    .references(() => services.id, { onDelete: 'cascade' })
    .notNull(),
  serviceName: text('service_name').notNull(),
  userUid: text('user_uid'),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  slotKey: text('slot_key').notNull().unique(),
  notes: text('notes'),
  status: text('status').notNull().default('pending'), // 'pending' | 'confirmed' | 'completed' | 'cancelled'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const quotations = pgTable('quotations', {
  id: serial('id').primaryKey(),
  quoteCode: text('quote_code').notNull().unique(),
  userUid: text('user_uid'),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone').notNull(),
  country: text('country').notNull(),
  city: text('city').notNull(),
  postalCode: text('postal_code'),
  itemsSummary: jsonb('items_summary').$type<QuotationItemRequest[]>().notNull(),
  notes: text('notes'),
  currency: text('currency').notNull().default('USD'),
  itemsAmountUsd: integer('items_amount_usd').notNull().default(0),
  shippingFeeUsd: integer('shipping_fee_usd').notNull().default(0),
  totalUsd: integer('total_usd').notNull().default(0),
  exchangeRateNgn: integer('exchange_rate_ngn').notNull().default(1600),
  adminNotes: text('admin_notes'),
  status: text('status').notNull().default('requested'), // 'requested' | 'quoted' | 'accepted' | 'declined' | 'paid'
  paystackReference: text('paystack_reference'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const returns = pgTable('returns', {
  id: serial('id').primaryKey(),
  returnCode: text('return_code').notNull().unique(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  orderNumber: text('order_number').notNull(),
  userUid: text('user_uid'),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone').notNull(),
  reason: text('reason').notNull(),
  conditionChecklist: jsonb('condition_checklist').$type<string[]>().notNull(),
  evidencePhotos: jsonb('evidence_photos').$type<string[]>().notNull(),
  status: text('status').notNull().default('submitted'), // 'submitted' | 'under_review' | 'approved' | 'rejected' | 'refunded'
  adminDecisionNote: text('admin_decision_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const storeSettings = pgTable('store_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  riversZones: jsonb('rivers_zones').$type<RiversZoneRule[]>().notNull(),
  interstateZones: jsonb('interstate_zones').$type<InterstateZoneRule[]>().notNull(),
  podEnabled: boolean('pod_enabled').notNull().default(false),
  podAllowedZones: jsonb('pod_allowed_zones').$type<string[]>().notNull(),
  podMaxOrderNgn: integer('pod_max_order_ngn').notNull().default(250000),
  bankTransferEnabled: boolean('bank_transfer_enabled').notNull().default(true),
  bankName: text('bank_name').notNull().default('Providus Bank'),
  bankAccountNumber: text('bank_account_number').notNull().default('5401928374'),
  bankAccountName: text('bank_account_name').notNull().default('Raw.hairs Studio Port Harcourt'),
  bankTransferInstructions: text('bank_transfer_instructions')
    .notNull()
    .default('Use your order reference as transfer narration, then upload your receipt and transaction code for Admin confirmation.'),
  deliveryProofMode: text('delivery_proof_mode').notNull().default('otp_photo'), // 'otp_photo' | 'otp' | 'photo' | 'rider_confirm'
  returnWindowHours: integer('return_window_hours').notNull().default(48),
  returnEligibilityNotes: text('return_eligibility_notes').notNull(),
  whatsappProvider: text('whatsapp_provider').notNull().default('meta_cloud'),
  whatsappEnabled: boolean('whatsapp_enabled').notNull().default(true),
  staffPermissions: jsonb('staff_permissions').$type<StaffPermissionMatrix>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  eventType: text('event_type').notNull(),
  entityId: text('entity_id').notNull(),
  recipientPhone: text('recipient_phone').notNull(),
  channel: text('channel').notNull().default('whatsapp'),
  provider: text('provider').notNull(),
  messageBody: text('message_body').notNull(),
  status: text('status').notNull().default('simulated'),
  providerResponse: jsonb('provider_response'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUid: text('actor_uid').notNull(),
  actorEmail: text('actor_email'),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  payments: many(payments),
  delivery: one(deliveries, {
    fields: [orders.id],
    references: [deliveries.orderId],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
}));
