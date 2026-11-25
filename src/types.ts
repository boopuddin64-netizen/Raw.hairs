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

export interface CommerceSettings {
  riversZones: RiversZoneRule[];
  interstateZones: InterstateZoneRule[];
  podEnabled: boolean;
  podAllowedZones: string[];
  podMaxOrderNgn: number;
  bankTransferEnabled: boolean;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  bankTransferInstructions: string;
  deliveryProofMode: 'otp' | 'photo' | 'rider_confirm';
  returnWindowHours: number;
  returnEligibilityNotes: string;
  whatsappProvider?: string;
  whatsappEnabled?: boolean;
  staffPermissions?: StaffPermissionMatrix;
}

export interface ProductVariant {
  id: number;
  productId: number;
  sku: string;
  lengthInches: number;
  laceType: string;
  colorShade: string;
  priceNgn: number;
  priceUsd: number;
  totalStock: number;
  availableStock: number;
  isActive: boolean;
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  categorySlug: string;
  texture: string;
  origin: string;
  description: string;
  imageUrl: string;
  gallery: string[];
  basePriceNgn: number;
  basePriceUsd: number;
  featured: boolean;
  isActive: boolean;
  variants: ProductVariant[];
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface SalonService {
  id: number;
  slug: string;
  name: string;
  description: string;
  priceNgn: number | null;
  durationMinutes: number;
}

export interface CartLine {
  productId: number;
  productSlug: string;
  productName: string;
  imageUrl: string;
  variantId: number;
  sku: string;
  lengthInches: number;
  laceType: string;
  priceNgn: number;
  quantity: number;
  maxStock: number;
}

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: 'customer' | 'dispatch' | 'staff' | 'owneradmin';
  defaultState: string | null;
  defaultZone: string | null;
  defaultAddress: string | null;
  isActive: boolean;
}

export interface OrderItem {
  id: number;
  productName: string;
  sku: string;
  lengthInches: number;
  laceType: string;
  unitPriceNgn: number;
  quantity: number;
  lineTotalNgn: number;
}

export interface OrderRecord {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  state: string;
  deliveryZone: string;
  city: string;
  address: string;
  subtotalNgn: number;
  deliveryFeeNgn: number;
  totalNgn: number;
  paymentMethod: 'paystack' | 'bank_transfer';
  paymentStatus: string;
  paystackReference: string | null;
  bankTransactionCode?: string | null;
  bankTransferReceipt?: string | null;
  bankTransferSubmittedAt?: string | null;
  bankTransferVerifiedBy?: string | null;
  bankTransferVerifiedAt?: string | null;
  status: string;
  assignedRiderUid: string | null;
  deliveredAt: string | null;
  createdAt: string;
  items?: OrderItem[];
}

export interface BookingRecord {
  id: number;
  bookingCode: string;
  serviceId: number;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  scheduledAt: string;
  notes: string | null;
  status: string;
}

export interface QuotationRecord {
  id: number;
  quoteCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  country: string;
  city: string;
  postalCode: string | null;
  itemsSummary: Array<{ productName: string; texture: string; lengthInches: number; quantity: number }>;
  notes: string | null;
  itemsAmountUsd: number;
  shippingFeeUsd: number;
  totalUsd: number;
  exchangeRateNgn: number;
  adminNotes: string | null;
  status: string;
  createdAt: string;
}

export interface ReturnRecord {
  id: number;
  returnCode: string;
  orderNumber: string;
  customerEmail: string;
  reason: string;
  conditionChecklist: string[];
  evidencePhotos: string[];
  status: string;
  adminDecisionNote: string | null;
  createdAt: string;
}

export interface DeliveryJob {
  id: number;
  orderId: number;
  orderNumber: string;
  assignedRiderUid: string;
  assignedRiderName: string;
  customerName: string;
  customerPhone: string;
  deliveryZone: string;
  address: string;
  step: 'assigned' | 'picked_up' | 'on_the_way' | 'delivered';
  proofType: string | null;
  proofNote: string | null;
  issueReport: string | null;
  updatedAt: string;
}

export function formatNaira(amount: number | null | undefined): string {
  const num = Number(amount) || 0;
  return `₦${num.toLocaleString('en-NG')}`;
}
