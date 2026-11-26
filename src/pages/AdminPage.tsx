import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, UserPlus } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { apiRequest } from '../lib/api.ts';
import {
  formatNaira,
  type BookingRecord,
  type Category,
  type CommerceSettings,
  type DbUser,
  type DeliveryJob,
  type OrderRecord,
  type Product,
  type QuotationRecord,
  type ReturnRecord,
  type SalonService,
} from '../types.ts';

interface AdminOverviewData {
  metrics: {
    paidRevenueNgn: number;
    totalOrders: number;
    pendingApproval: number;
    pendingTransferConfirmations: number;
    activeReservations: number;
    pendingBookings: number;
    openReturns: number;
    openQuotations: number;
    lowStockVariants: number;
  };
  categories: Category[];
  products: Product[];
  orders: OrderRecord[];
  payments: Array<{
    id: number;
    orderId: number;
    reference: string;
    amountNgn: number;
    status: string;
    channel: string | null;
    createdAt: string;
  }>;
  bookings: BookingRecord[];
  quotations: QuotationRecord[];
  returns: ReturnRecord[];
  deliveries: DeliveryJob[];
  services: SalonService[];
  users: DbUser[];
  riders?: DbUser[];
  auditLogs: Array<{
    id: number;
    actorEmail: string | null;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
  }>;
  inventoryLogs: Array<{
    id: number;
    variantId: number;
    delta: number;
    reason: string;
    referenceCode: string | null;
    createdAt: string;
  }>;
  notifications: Array<{
    id: number;
    eventType: string;
    entityId: string;
    recipientPhone: string;
    channel?: string;
    provider?: string;
    status: string;
    messageBody: string;
    createdAt: string;
  }>;
  settings: CommerceSettings;
}

interface AdminUsersResponse {
  users: DbUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    all: number;
    customer: number;
    dispatch: number;
    staff: number;
    owneradmin: number;
    active: number;
    suspended: number;
  };
}

type AdminSection =
  | 'overview'
  | 'products'
  | 'inventory'
  | 'orders'
  | 'payments'
  | 'deliveries'
  | 'bookings'
  | 'quotations'
  | 'returns'
  | 'catalog_services'
  | 'rbac'
  | 'settings'
  | 'logs';

const PRESET_IMAGES = [
  { label: 'Bone Straight (/catalogue/bone.jpg)', value: '/catalogue/bone.jpg' },
  { label: 'Body Wave (/catalogue/body.jpg)', value: '/catalogue/body.jpg' },
  { label: 'Deep Wave (/catalogue/deep.jpg)', value: '/catalogue/deep.jpg' },
  { label: 'Water Wave (/catalogue/water.jpg)', value: '/catalogue/water.jpg' },
  { label: 'Curly (/catalogue/curl.jpg)', value: '/catalogue/curl.jpg' },
  { label: 'Full Unit Wig (/catalogue/unit.jpg)', value: '/catalogue/unit.jpg' },
  { label: 'Bob Unit (/catalogue/bob-unit.jpg)', value: '/catalogue/bob-unit.jpg' },
  { label: 'Frontal (/catalogue/frontal.jpg)', value: '/catalogue/frontal.jpg' },
  { label: 'Silk Hair Care Elixir', value: '/src/assets/images/care_silk_elixir_1795590466182.jpg' },
  { label: 'Titanium Hair Straightener', value: '/src/assets/images/tool_titanium_straightener_1795590464705.jpg' },
  { label: 'Ceramic Barrel Hair Curler', value: '/src/assets/images/tool_ceramic_curler_1795590466057.jpg' },
  { label: 'Precision Clipper & Shears', value: '/src/assets/images/tool_precision_clipper_1795590465593.jpg' },
];

export function AdminPage() {
  const { dbUser, authReady, getIdToken, notify, navigate, refreshCatalog } = useStore();
  const [section, setSection] = useState<AdminSection>('overview');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [riderSelection, setRiderSelection] = useState<Record<number, string>>({});

  const [newProdName, setNewProdName] = useState('');
  const [newProdCat, setNewProdCat] = useState('bone-straight');
  const [newProdPrice, setNewProdPrice] = useState('145000');
  const [newProdImage, setNewProdImage] = useState('/catalogue/bone.jpg');
  const [newProdSpec, setNewProdSpec] = useState('5x5 HD Closure');
  const [newProdLength, setNewProdLength] = useState('18');
  const [newProdDesc, setNewProdDesc] = useState('');

  const [newCatName, setNewCatName] = useState('');
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcPrice, setNewSvcPrice] = useState('20000');
  const [newSvcDesc, setNewSvcDesc] = useState('');

  const [quoteDraft, setQuoteDraft] = useState<Record<number, { itemsUsd: string; shipUsd: string }>>({});
  const [settingsDraft, setSettingsDraft] = useState<CommerceSettings | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{
    orderNumber: string;
    code: string;
    image: string;
    label?: string;
  } | null>(null);

  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearchApplied, setUserSearchApplied] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'dispatch' | 'staff' | 'owneradmin' | 'customer'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [userPage, setUserPage] = useState(1);
  const [usersDir, setUsersDir] = useState<AdminUsersResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);

  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<'dispatch' | 'staff' | 'customer'>('dispatch');
  const [newUserZone, setNewUserZone] = useState('ph-gra');
  const [addingUser, setAddingUser] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await apiRequest<AdminOverviewData>('/api/admin/overview', { token });
      setData(res);
      setSettingsDraft(res.settings);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load admin console.', 'error');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, notify]);

  const loadUsersDirectory = useCallback(async () => {
    setUsersLoading(true);
    try {
      const token = await getIdToken();
      const qs = new URLSearchParams({
        page: String(userPage),
        pageSize: '12',
        role: userRoleFilter,
        status: userStatusFilter,
      });
      if (userSearchApplied) qs.set('search', userSearchApplied);
      const res = await apiRequest<AdminUsersResponse>(`/api/admin/users?${qs.toString()}`, { token });
      setUsersDir(res);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load user directory.', 'error');
    } finally {
      setUsersLoading(false);
    }
  }, [getIdToken, notify, userPage, userRoleFilter, userSearchApplied, userStatusFilter]);

  useEffect(() => {
    if (dbUser && ['staff', 'owneradmin'].includes(dbUser.role)) {
      void loadOverview();
    } else {
      setLoading(false);
    }
  }, [dbUser, loadOverview]);

  useEffect(() => {
    if (dbUser && ['staff', 'owneradmin'].includes(dbUser.role) && section === 'rbac') {
      void loadUsersDirectory();
    }
  }, [dbUser, loadUsersDirectory, section]);

  if (!authReady || loading) {
    return (
      <div className="mx-auto max-w-[1360px] px-5 py-12">
        <div className="h-64 rounded-3xl border border-[var(--line)] bg-[var(--surface)] animate-pulse" />
      </div>
    );
  }

  if (!dbUser || !['staff', 'owneradmin'].includes(dbUser.role)) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8">
          <h1 className="font-display text-3xl">Operations Access Required</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Only verified Raw.hairs staff and owner accounts can access this workspace.
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

  const riders = data?.riders || (data?.users || []).filter((u) => u.role === 'dispatch' && u.isActive);

  const handleOrderTransition = async (orderId: number, nextStatus: string) => {
    try {
      const token = await getIdToken();
      await apiRequest(`/api/admin/orders/${orderId}/transition`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          nextStatus,
          riderUid: riderSelection[orderId] || riders[0]?.uid,
        }),
      });
      notify(`Order moved to ${nextStatus.replace(/_/g, ' ')}`, 'ok');
      await loadOverview();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Order transition blocked.', 'error');
    }
  };

  const handleConfirmBankTransfer = async (orderId: number) => {
    try {
      const token = await getIdToken();
      await apiRequest(`/api/admin/orders/${orderId}/confirm-bank-transfer`, {
        method: 'POST',
        token,
      });
      notify('Bank transfer confirmed and order approved for dispatch.', 'ok');
      await loadOverview();
      void refreshCatalog();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to confirm bank transfer.', 'error');
    }
  };

  const handleRejectBankTransfer = async (orderId: number) => {
    try {
      const token = await getIdToken();
      await apiRequest(`/api/admin/orders/${orderId}/reject-bank-transfer`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason: 'Transaction code or receipt could not be verified.' }),
      });
      notify('Bank transfer rejected and reserved stock released.', 'info');
      await loadOverview();
      void refreshCatalog();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to reject bank transfer.', 'error');
    }
  };

  const handleAdjustStock = async (variantId: number, delta: number) => {
    try {
      const token = await getIdToken();
      await apiRequest(`/api/admin/variants/${variantId}/stock`, {
        method: 'POST',
        token,
        body: JSON.stringify({ delta, reason: delta > 0 ? 'admin_restock' : 'admin_count_correction' }),
      });
      notify('Variant stock updated.', 'ok');
      await loadOverview();
      void refreshCatalog();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Stock adjustment failed.', 'error');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const isNonHair = ['hair-care', 'styling-tools'].includes(newProdCat);
    const parsedLen = isNonHair ? 0 : Math.max(0, Number(newProdLength) || 0);
    const priceNgn = Number(newProdPrice) || 45000;
    const priceUsd = Math.max(10, Math.round(priceNgn / 1550));
    try {
      const token = await getIdToken();
      await apiRequest('/api/admin/products', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: newProdName,
          categorySlug: newProdCat,
          texture:
            newProdCat === 'hair-care'
              ? 'Hair Care'
              : newProdCat === 'styling-tools'
                ? 'Styling Tools'
                : newProdCat,
          description: newProdDesc,
          imageUrl: newProdImage,
          basePriceNgn: priceNgn,
          basePriceUsd: priceUsd,
          featured: true,
          variants: [
            {
              lengthInches: parsedLen,
              laceType: newProdSpec || (isNonHair ? 'Standard Edition' : '5x5 HD Closure'),
              colorShade: isNonHair ? 'Signature Rose' : 'Natural Black',
              priceNgn,
              priceUsd,
              totalStock: 8,
            },
          ],
        }),
      });
      setNewProdName('');
      setNewProdDesc('');
      notify('Product added to catalogue.', 'ok');
      await loadOverview();
      void refreshCatalog();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to create product.', 'error');
    }
  };

  const handleBookingStatus = async (id: number, status: string) => {
    try {
      const token = await getIdToken();
      await apiRequest(`/api/admin/bookings/${id}/status`, {
        method: 'POST',
        token,
        body: JSON.stringify({ status }),
      });
      notify(`Booking marked ${status}.`, 'ok');
      await loadOverview();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update booking.', 'error');
    }
  };

  const handleSendQuote = async (id: number) => {
    const d = quoteDraft[id] || { itemsUsd: '150', shipUsd: '45' };
    try {
      const token = await getIdToken();
      await apiRequest(`/api/admin/quotations/${id}/quote`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          itemsAmountUsd: Number(d.itemsUsd),
          shippingFeeUsd: Number(d.shipUsd),
          exchangeRateNgn: 1600,
        }),
      });
      notify('USD quotation published to customer.', 'ok');
      await loadOverview();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to send quote.', 'error');
    }
  };

  const handleReturnDecision = async (id: number, status: string) => {
    try {
      const token = await getIdToken();
      await apiRequest(`/api/admin/returns/${id}/decision`, {
        method: 'POST',
        token,
        body: JSON.stringify({ status, adminDecisionNote: `Reviewed by ${dbUser.email}` }),
      });
      notify(`Return claim updated to ${status}.`, 'ok');
      await loadOverview();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update return.', 'error');
    }
  };

  const handleRoleChange = async (uid: string, role: string, isActive?: boolean) => {
    try {
      const token = await getIdToken();
      await apiRequest(`/api/admin/users/${uid}/role`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ role, isActive }),
      });
      notify('Staff/RBAC role updated.', 'ok');
      await Promise.all([loadOverview(), loadUsersDirectory()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'RBAC update failed.', 'error');
    }
  };

  const handleProvisionUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingUser(true);
    try {
      const token = await getIdToken();
      await apiRequest('/api/admin/users', {
        method: 'POST',
        token,
        body: JSON.stringify({
          fullName: newUserName,
          email: newUserEmail,
          phone: newUserPhone,
          role: newUserRole,
          defaultZone: newUserZone,
        }),
      });
      notify('Team member added. Their role activates as soon as they sign in with this email.', 'ok');
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPhone('');
      setAddUserOpen(false);
      setUserPage(1);
      await Promise.all([loadOverview(), loadUsersDirectory()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to add user.', 'error');
    } finally {
      setAddingUser(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsDraft) return;
    try {
      const token = await getIdToken();
      await apiRequest('/api/admin/settings', {
        method: 'PATCH',
        token,
        body: JSON.stringify(settingsDraft),
      });
      notify('Store settings & Rivers State rules saved.', 'ok');
      await loadOverview();
      void refreshCatalog();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Settings save failed.', 'error');
    }
  };

  const navItems: Array<{ id: AdminSection; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'orders', label: `Orders (${data?.orders.length || 0})` },
    { id: 'products', label: `Products (${data?.products.length || 0})` },
    { id: 'inventory', label: 'Inventory & Ledger' },
    { id: 'payments', label: 'Payments' },
    { id: 'deliveries', label: 'Deliveries' },
    { id: 'bookings', label: 'Bookings' },
    { id: 'quotations', label: 'Int’l Quotations' },
    { id: 'returns', label: 'Returns (48h)' },
    { id: 'catalog_services', label: 'Categories & Services' },
    { id: 'rbac', label: 'Staff & RBAC' },
    { id: 'settings', label: 'Rivers Zones & Settings' },
    { id: 'logs', label: 'Audit & WhatsApp Logs' },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-5 py-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[248px_1fr] items-start">
        <aside className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5 sm:p-4 min-w-0">
          <div className="border-b border-[var(--line)] pb-3 mb-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--champagne)]">{dbUser.role}</p>
            <p className="text-sm font-medium truncate">{dbUser.email}</p>
          </div>
          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar pb-1 lg:pb-0">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`min-h-[40px] shrink-0 rounded-xl text-left px-3.5 py-2 text-xs whitespace-nowrap transition-colors cursor-pointer ${
                  section === item.id
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-medium'
                    : 'text-[var(--soft)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
            <div className="min-w-0">
              <p className="text-xs text-[var(--muted)] truncate">
                Operations / {navItems.find((n) => n.id === section)?.label}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-medium">Raw.hairs Operations</h1>
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="min-h-[40px] inline-flex items-center gap-2 rounded-full border border-[var(--line-2)] px-4 py-2 text-xs uppercase cursor-pointer shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sync</span>
            </button>
          </div>

          {data && section === 'overview' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: 'Verified Revenue', value: formatNaira(data.metrics.paidRevenueNgn) },
                { label: 'Transfers to Confirm', value: String(data.metrics.pendingTransferConfirmations || 0) },
                { label: 'Ready to Approve', value: String(data.metrics.pendingApproval) },
                { label: 'Total Orders', value: String(data.metrics.totalOrders) },
                { label: 'Active Stock Holds', value: String(data.metrics.activeReservations) },
                { label: 'Low Stock Variants', value: String(data.metrics.lowStockVariants) },
                { label: 'Pending Bookings', value: String(data.metrics.pendingBookings) },
                { label: 'Open 48h Returns', value: String(data.metrics.openReturns) },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 min-w-0">
                  <p className="text-[11px] sm:text-xs uppercase tracking-[0.1em] text-[var(--muted)] truncate">
                    {kpi.label}
                  </p>
                  <p className="mt-2 font-mono-num text-lg sm:text-2xl font-medium text-[var(--ink)] truncate">
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {data && section === 'orders' && (
            <div className="space-y-4">
              {data.orders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                    <div>
                      <span className="font-mono-num font-medium">{order.orderNumber}</span>
                      <span className="block sm:inline sm:ml-3 text-xs text-[var(--muted)]">
                        {order.customerName} · {order.deliveryZone}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="uppercase">{order.paymentMethod.replace('_', ' ')}</span>
                      <span>Payment: {order.paymentStatus.replace(/_/g, ' ')}</span>
                      <span className="uppercase font-medium text-[var(--accent)]">
                        {order.status.replace(/_/g, ' ')}
                      </span>
                      {order.deliveryOtp && (
                        <span className="rounded-lg border border-[var(--champagne)]/40 bg-[var(--surface-2)] px-2.5 py-0.5 font-mono-num text-[var(--champagne)]">
                          OTP: {order.deliveryOtp}
                        </span>
                      )}
                      <span className="font-mono-num text-sm font-medium">{formatNaira(order.totalNgn)}</span>
                    </div>
                  </div>

                  {order.paymentMethod === 'bank_transfer' && (
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
                      <div className="space-y-1">
                        <p className="text-[var(--muted)]">
                          Bank Transaction Code:{' '}
                          <strong className="font-mono-num text-[var(--ink)]">
                            {order.bankTransactionCode || 'Not submitted yet'}
                          </strong>
                        </p>
                        {order.bankTransferVerifiedBy && (
                          <p className="text-[var(--ok)]">
                            Confirmed by {order.bankTransferVerifiedBy}
                          </p>
                        )}
                      </div>

                      {order.bankTransferReceipt && (
                        <button
                          type="button"
                          onClick={() =>
                            setReceiptPreview({
                              orderNumber: order.orderNumber,
                              code: order.bankTransactionCode || '',
                              image: order.bankTransferReceipt!,
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--champagne)] px-3.5 py-1.5 text-xs text-[var(--champagne)] cursor-pointer"
                        >
                          <img
                            src={order.bankTransferReceipt}
                            alt="Receipt thumbnail"
                            className="h-5 w-5 rounded object-cover"
                          />
                          <span>Inspect Receipt</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--line)]">
                    {order.paymentMethod === 'bank_transfer' &&
                      order.paymentStatus !== 'paid' &&
                      order.status !== 'cancelled' &&
                      order.bankTransactionCode && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleConfirmBankTransfer(order.id)}
                            className="min-h-[40px] w-full sm:w-auto rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-ink)] cursor-pointer"
                          >
                            Confirm Transfer &amp; Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRejectBankTransfer(order.id)}
                            className="min-h-[40px] w-full sm:w-auto rounded-full border border-[var(--bad)] px-4 py-2 text-xs text-[var(--bad)] cursor-pointer"
                          >
                            Reject Transfer
                          </button>
                        </>
                      )}
                    {order.status === 'paid' && (
                      <button
                        type="button"
                        onClick={() => void handleOrderTransition(order.id, 'approved')}
                        className="min-h-[40px] w-full sm:w-auto rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-ink)] cursor-pointer"
                      >
                        Approve Order
                      </button>
                    )}
                    {order.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() => void handleOrderTransition(order.id, 'processing')}
                        className="min-h-[40px] w-full sm:w-auto rounded-full border border-[var(--accent)] px-4 py-2 text-xs text-[var(--accent)] cursor-pointer"
                      >
                        Start Processing
                      </button>
                    )}
                    {order.status === 'processing' && (
                      <>
                        <select
                          value={riderSelection[order.id] || riders[0]?.uid || ''}
                          onChange={(e) => setRiderSelection((p) => ({ ...p, [order.id]: e.target.value }))}
                          className="h-10 w-full sm:w-auto rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-xs"
                        >
                          {riders.map((r) => (
                            <option key={r.uid} value={r.uid}>
                              {r.fullName || r.email}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleOrderTransition(order.id, 'ready_for_dispatch')}
                          className="min-h-[40px] w-full sm:w-auto rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-ink)] cursor-pointer"
                        >
                          Assign Rider &amp; Ready
                        </button>
                      </>
                    )}
                    {order.status === 'ready_for_dispatch' && (
                      <button
                        type="button"
                        onClick={() => void handleOrderTransition(order.id, 'out_for_delivery')}
                        className="min-h-[40px] w-full sm:w-auto rounded-full border border-[var(--champagne)] px-4 py-2 text-xs text-[var(--champagne)] cursor-pointer"
                      >
                        Mark Out for Delivery
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && section === 'products' && (
            <div className="space-y-6">
              <form
                onSubmit={handleCreateProduct}
                className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 grid gap-3 sm:grid-cols-3 items-end"
              >
                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">Product Name</label>
                  <input
                    required
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="e.g. Titanium Silk Press Iron"
                    className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">Category</label>
                  <select
                    value={newProdCat}
                    onChange={(e) => {
                      const slug = e.target.value;
                      setNewProdCat(slug);
                      if (slug === 'hair-care') {
                        setNewProdImage('/src/assets/images/care_silk_elixir_1795590466182.jpg');
                        setNewProdLength('0');
                        setNewProdSpec('100ml Elixir');
                      } else if (slug === 'styling-tools') {
                        setNewProdImage('/src/assets/images/tool_titanium_straightener_1795590464705.jpg');
                        setNewProdLength('0');
                        setNewProdSpec('450°F Salon Edition');
                      }
                    }}
                    className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                  >
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">Base Price (NGN)</label>
                  <input
                    type="number"
                    required
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm font-mono-num"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">Studio Image Preset</label>
                  <select
                    value={newProdImage}
                    onChange={(e) => setNewProdImage(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                  >
                    {PRESET_IMAGES.map((img) => (
                      <option key={img.value} value={img.value}>
                        {img.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">Edition / Lace Spec</label>
                  <input
                    value={newProdSpec}
                    onChange={(e) => setNewProdSpec(e.target.value)}
                    placeholder="e.g. 5x5 HD Closure or Pro 240V"
                    className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">Length (in, 0 for Care/Tools)</label>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={newProdLength}
                    onChange={(e) => setNewProdLength(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm font-mono-num"
                  />
                </div>

                <div className="sm:col-span-2">
                  <input
                    required
                    placeholder="Product description..."
                    value={newProdDesc}
                    onChange={(e) => setNewProdDesc(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="h-10 rounded-full bg-[var(--accent)] px-5 text-xs font-medium uppercase text-[var(--accent-ink)] cursor-pointer"
                >
                  Add Product
                </button>
              </form>

              <div className="md:hidden space-y-3">
                {data.products.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {p.texture} · {p.variants.length} variants
                      </p>
                    </div>
                    <span className="font-mono-num text-sm font-medium shrink-0">{formatNaira(p.basePriceNgn)}</span>
                  </div>
                ))}
              </div>

              <div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="p-3.5">Product</th>
                      <th className="p-3.5">Texture / Line</th>
                      <th className="p-3.5">Variants</th>
                      <th className="p-3.5 text-right">Base Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {data.products.map((p) => (
                      <tr key={p.id}>
                        <td className="p-3.5 font-medium">{p.name}</td>
                        <td className="p-3.5 text-[var(--muted)]">{p.texture}</td>
                        <td className="p-3.5 font-mono-num">{p.variants.length}</td>
                        <td className="p-3.5 text-right font-mono-num">{formatNaira(p.basePriceNgn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data && section === 'inventory' && (
            <div className="space-y-6">
              <div className="md:hidden space-y-3">
                {data.products.flatMap((p) =>
                  p.variants.map((v) => (
                    <div key={v.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono-num text-xs text-[var(--muted)]">{v.sku}</p>
                          <p className="font-medium text-sm">
                            {p.name} · {v.lengthInches > 0 ? `${v.lengthInches}" (${v.laceType})` : v.laceType}
                          </p>
                        </div>
                        <span className="font-mono-num text-base font-medium shrink-0">{v.totalStock}</span>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void handleAdjustStock(v.id, -1)}
                          className="min-h-[40px] min-w-[52px] rounded-full border border-[var(--line-2)] px-4 text-xs cursor-pointer"
                        >
                          -1
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdjustStock(v.id, 1)}
                          className="min-h-[40px] min-w-[52px] rounded-full border border-[var(--accent)] px-4 text-xs text-[var(--accent)] cursor-pointer"
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  )),
                )}
              </div>

              <div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="p-3.5">SKU</th>
                      <th className="p-3.5">Product &amp; Variant</th>
                      <th className="p-3.5 text-right">Stock</th>
                      <th className="p-3.5 text-right">Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {data.products.flatMap((p) =>
                      p.variants.map((v) => (
                        <tr key={v.id}>
                          <td className="p-3.5 font-mono-num text-xs">{v.sku}</td>
                          <td className="p-3.5">
                            {p.name} · {v.lengthInches > 0 ? `${v.lengthInches}" (${v.laceType})` : v.laceType}
                          </td>
                          <td className="p-3.5 text-right font-mono-num">{v.totalStock}</td>
                          <td className="p-3.5 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => void handleAdjustStock(v.id, 1)}
                              className="rounded-full border border-[var(--line-2)] px-3 py-1 text-xs cursor-pointer"
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAdjustStock(v.id, -1)}
                              className="rounded-full border border-[var(--line-2)] px-3 py-1 text-xs cursor-pointer"
                            >
                              -1
                            </button>
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
                <h2 className="font-display text-2xl mb-3">Stock Movement History</h2>
                <div className="divide-y divide-[var(--line)] text-xs">
                  {data.inventoryLogs.map((log) => (
                    <div key={log.id} className="py-2.5 flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        <strong className="font-mono-num">{log.referenceCode}</strong> · {log.reason}
                      </span>
                      <span className="font-mono-num shrink-0">
                        {log.delta > 0 ? `+${log.delta}` : log.delta}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {data && section === 'payments' && (
            <>
              <div className="md:hidden space-y-3">
                {data.payments.map((pay) => (
                  <div key={pay.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono-num text-sm truncate">{pay.reference}</p>
                      <p className="text-xs text-[var(--muted)] uppercase">
                        {pay.channel || 'paystack'} · {pay.status}
                      </p>
                    </div>
                    <span className="font-mono-num text-sm font-medium shrink-0">{formatNaira(pay.amountNgn)}</span>
                  </div>
                ))}
              </div>

              <div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="p-3.5">Reference</th>
                      <th className="p-3.5">Channel</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {data.payments.map((pay) => (
                      <tr key={pay.id}>
                        <td className="p-3.5 font-mono-num">{pay.reference}</td>
                        <td className="p-3.5 text-[var(--muted)]">{pay.channel || 'paystack'}</td>
                        <td className="p-3.5 uppercase text-xs">{pay.status}</td>
                        <td className="p-3.5 text-right font-mono-num">{formatNaira(pay.amountNgn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {data && section === 'deliveries' && (
            <div className="space-y-3">
              {data.deliveries.map((d) => (
                <div
                  key={d.id}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="font-mono-num font-medium">{d.orderNumber}</p>
                    <p className="text-xs text-[var(--muted)]">
                      Rider: {d.assignedRiderName} · Zone: {d.deliveryZone}
                    </p>
                    {(d.proofType || d.proofNote) && (
                      <p className="text-xs text-[var(--ok)]">
                        Proof: {(d.proofType || 'verified').replace(/_/g, ' ')}
                        {d.proofNote ? ` · Customer OTP Verified: ${d.proofNote}` : ''}
                      </p>
                    )}
                    {d.issueReport && <p className="mt-1 text-xs text-[var(--warn)]">Issue: {d.issueReport}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {d.proofPhotoData && (
                      <button
                        type="button"
                        onClick={() =>
                          setReceiptPreview({
                            orderNumber: d.orderNumber,
                            label: 'Rider Delivery Proof',
                            code: d.proofNote ? `OTP Verified: ${d.proofNote}` : 'Delivery Proof Photo',
                            image: d.proofPhotoData!,
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--champagne)] px-3.5 py-1.5 text-xs text-[var(--champagne)] cursor-pointer"
                      >
                        <img
                          src={d.proofPhotoData}
                          alt={`Delivery proof for ${d.orderNumber}`}
                          className="h-5 w-5 rounded object-cover"
                        />
                        <span>View Delivery Photo</span>
                      </button>
                    )}
                    <span className="text-xs uppercase font-medium text-[var(--accent)]">
                      {d.step.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && section === 'bookings' && (
            <div className="space-y-3">
              {data.bookings.map((bk) => (
                <div
                  key={bk.id}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 flex flex-wrap justify-between gap-4"
                >
                  <div>
                    <p className="font-mono-num text-xs text-[var(--muted)]">{bk.bookingCode}</p>
                    <p className="font-medium">{bk.serviceName} — {bk.customerName}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {new Date(bk.scheduledAt).toLocaleString()} · {bk.customerPhone}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase mr-2">{bk.status}</span>
                    <button
                      type="button"
                      onClick={() => void handleBookingStatus(bk.id, 'confirmed')}
                      className="rounded-full border border-[var(--ok)] px-3.5 py-1.5 text-xs text-[var(--ok)] cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBookingStatus(bk.id, 'completed')}
                      className="rounded-full border border-[var(--line-2)] px-3.5 py-1.5 text-xs cursor-pointer"
                    >
                      Complete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && section === 'quotations' && (
            <div className="space-y-4">
              {data.quotations.map((q) => (
                <div key={q.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
                  <div className="flex justify-between">
                    <div>
                      <span className="font-mono-num font-medium">{q.quoteCode}</span>
                      <span className="ml-3 text-xs text-[var(--muted)]">
                        {q.customerName} · {q.city}, {q.country}
                      </span>
                    </div>
                    <span className="text-xs uppercase text-[var(--champagne)]">{q.status}</span>
                  </div>
                  {q.status === 'requested' && (
                    <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-[var(--line)]">
                      <input
                        type="number"
                        placeholder="Items USD"
                        value={quoteDraft[q.id]?.itemsUsd ?? '160'}
                        onChange={(e) =>
                          setQuoteDraft((p) => ({
                            ...p,
                            [q.id]: { itemsUsd: e.target.value, shipUsd: p[q.id]?.shipUsd ?? '45' },
                          }))
                        }
                        className="h-9 w-28 rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-2.5 text-xs font-mono-num"
                      />
                      <input
                        type="number"
                        placeholder="DHL/FedEx USD"
                        value={quoteDraft[q.id]?.shipUsd ?? '45'}
                        onChange={(e) =>
                          setQuoteDraft((p) => ({
                            ...p,
                            [q.id]: { itemsUsd: p[q.id]?.itemsUsd ?? '160', shipUsd: e.target.value },
                          }))
                        }
                        className="h-9 w-28 rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-2.5 text-xs font-mono-num"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSendQuote(q.id)}
                        className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-ink)] cursor-pointer"
                      >
                        Send USD Quote
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {data && section === 'returns' && (
            <div className="space-y-4">
              {data.returns.map((r) => (
                <div key={r.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
                  <div className="flex justify-between">
                    <span className="font-mono-num font-medium">
                      {r.returnCode} · Order {r.orderNumber}
                    </span>
                    <span className="text-xs uppercase text-[var(--accent)]">{r.status}</span>
                  </div>
                  <p className="text-sm text-[var(--soft)]">{r.reason}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleReturnDecision(r.id, 'approved')}
                      className="rounded-full border border-[var(--ok)] px-4 py-1.5 text-xs text-[var(--ok)] cursor-pointer"
                    >
                      Approve Return
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReturnDecision(r.id, 'rejected')}
                      className="rounded-full border border-[var(--bad)] px-4 py-1.5 text-xs text-[var(--bad)] cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && section === 'catalog_services' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4">
                <h2 className="font-display text-2xl">Add Category</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    placeholder="e.g. Raw Closures"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="h-11 flex-1 rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const token = await getIdToken();
                      await apiRequest('/api/admin/categories', {
                        method: 'POST',
                        token,
                        body: JSON.stringify({ name: newCatName }),
                      });
                      setNewCatName('');
                      notify('Category added.', 'ok');
                      await loadOverview();
                    }}
                    className="min-h-[44px] rounded-full bg-[var(--accent)] px-5 text-xs font-medium text-[var(--accent-ink)] cursor-pointer shrink-0"
                  >
                    Create
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
                <h2 className="font-display text-2xl">Add Studio Service</h2>
                <input
                  placeholder="Service title"
                  value={newSvcName}
                  onChange={(e) => setNewSvcName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                />
                <input
                  type="number"
                  placeholder="Price NGN"
                  value={newSvcPrice}
                  onChange={(e) => setNewSvcPrice(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm font-mono-num"
                />
                <input
                  placeholder="Service description"
                  value={newSvcDesc}
                  onChange={(e) => setNewSvcDesc(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const token = await getIdToken();
                    await apiRequest('/api/admin/services', {
                      method: 'POST',
                      token,
                      body: JSON.stringify({ name: newSvcName, priceNgn: Number(newSvcPrice), description: newSvcDesc }),
                    });
                    setNewSvcName('');
                    setNewSvcDesc('');
                    notify('Service published.', 'ok');
                    await loadOverview();
                  }}
                  className="w-full sm:w-auto min-h-[44px] rounded-full bg-[var(--accent)] px-6 py-2.5 text-xs font-medium text-[var(--accent-ink)] cursor-pointer"
                >
                  Publish Service
                </button>
              </div>
            </div>
          )}

          {data && section === 'rbac' && (
            <div className="space-y-5">
              {/* Role Filter Tabs & Add Driver/Staff Action */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all' as const, label: 'All Users', count: usersDir?.counts.all },
                    { id: 'dispatch' as const, label: 'Drivers', count: usersDir?.counts.dispatch },
                    { id: 'staff' as const, label: 'Staff', count: usersDir?.counts.staff },
                    { id: 'owneradmin' as const, label: 'Admins', count: usersDir?.counts.owneradmin },
                    { id: 'customer' as const, label: 'Customers', count: usersDir?.counts.customer },
                  ].map((tabItem) => (
                    <button
                      key={tabItem.id}
                      type="button"
                      onClick={() => {
                        setUserRoleFilter(tabItem.id);
                        setUserPage(1);
                      }}
                      className={`min-h-[38px] rounded-xl px-3.5 py-1.5 text-xs transition-colors cursor-pointer ${
                        userRoleFilter === tabItem.id
                          ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-medium'
                          : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--soft)] hover:border-[var(--line-2)]'
                      }`}
                    >
                      {tabItem.label}
                      {tabItem.count !== undefined ? ` (${tabItem.count})` : ''}
                    </button>
                  ))}
                </div>

                {dbUser.role === 'owneradmin' && (
                  <button
                    type="button"
                    onClick={() => setAddUserOpen(true)}
                    className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-medium uppercase tracking-[0.1em] text-[var(--accent-ink)] cursor-pointer shrink-0"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Add Driver / Staff</span>
                  </button>
                )}
              </div>

              {/* Search & Status Filter Toolbar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setUserSearchApplied(userSearchInput.trim());
                  setUserPage(1);
                }}
                className="flex flex-col sm:flex-row gap-2.5"
              >
                <div className="relative flex-1">
                  <Search className="h-4 w-4 text-[var(--muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    value={userSearchInput}
                    onChange={(e) => setUserSearchInput(e.target.value)}
                    placeholder="Search by name, email, or phone..."
                    className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--surface)] pl-10 pr-3 text-sm"
                  />
                </div>
                <select
                  aria-label="Filter by status"
                  value={userStatusFilter}
                  onChange={(e) => {
                    setUserStatusFilter(e.target.value as 'all' | 'active' | 'suspended');
                    setUserPage(1);
                  }}
                  className="h-10 rounded-xl border border-[var(--line-2)] bg-[var(--surface)] px-3 text-xs"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active Only</option>
                  <option value="suspended">Suspended Only</option>
                </select>
                <button
                  type="submit"
                  className="h-10 rounded-xl border border-[var(--line-2)] bg-[var(--surface)] px-4 text-xs uppercase tracking-[0.08em] hover:border-[var(--accent)] cursor-pointer shrink-0"
                >
                  Search
                </button>
                {(userSearchApplied || userRoleFilter !== 'all' || userStatusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserSearchInput('');
                      setUserSearchApplied('');
                      setUserRoleFilter('all');
                      setUserStatusFilter('all');
                      setUserPage(1);
                    }}
                    className="h-10 rounded-xl border border-[var(--line)] px-3.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer shrink-0"
                  >
                    Reset
                  </button>
                )}
              </form>

              {/* Directory Content */}
              {usersLoading ? (
                <div className="h-48 rounded-2xl border border-[var(--line)] bg-[var(--surface)] animate-pulse" />
              ) : (usersDir?.users || []).length === 0 ? (
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
                  No accounts match your current search or filter.
                </div>
              ) : (
                <>
                  <div className="md:hidden space-y-3">
                    {(usersDir?.users || []).map((u) => {
                      const isSelf = u.uid === dbUser.uid;
                      const isPending = u.uid.startsWith('pending-');
                      return (
                        <div key={u.uid} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {u.fullName || u.email}
                              {isPending && (
                                <span className="ml-2 text-[11px] font-normal text-[var(--champagne)]">
                                  (Awaiting first sign-in)
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-[var(--muted)] truncate">
                              {u.email}
                              {u.phone ? ` · ${u.phone}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <select
                              disabled={dbUser.role !== 'owneradmin' || isSelf}
                              value={u.role}
                              onChange={(e) => void handleRoleChange(u.uid, e.target.value, u.isActive)}
                              className="h-10 flex-1 rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-xs disabled:opacity-50"
                            >
                              <option value="customer">customer</option>
                              <option value="dispatch">dispatch (driver)</option>
                              <option value="staff">staff</option>
                              <option value="owneradmin">owneradmin</option>
                            </select>
                            <button
                              type="button"
                              disabled={dbUser.role !== 'owneradmin' || isSelf}
                              onClick={() => void handleRoleChange(u.uid, u.role, !u.isActive)}
                              className="min-h-[40px] rounded-full border border-[var(--line-2)] px-4 py-1 text-xs cursor-pointer shrink-0 disabled:opacity-50"
                            >
                              {u.isActive ? 'Active' : 'Suspended'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
                        <tr>
                          <th className="p-3.5">Account</th>
                          <th className="p-3.5">Zone</th>
                          <th className="p-3.5">Role</th>
                          <th className="p-3.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {(usersDir?.users || []).map((u) => {
                          const isSelf = u.uid === dbUser.uid;
                          const isPending = u.uid.startsWith('pending-');
                          return (
                            <tr key={u.uid}>
                              <td className="p-3.5">
                                <p className="font-medium">
                                  {u.fullName || u.email}
                                  {isPending && (
                                    <span className="ml-2 text-[11px] font-normal text-[var(--champagne)]">
                                      (Awaiting first sign-in)
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-[var(--muted)]">
                                  {u.email}
                                  {u.phone ? ` · ${u.phone}` : ''}
                                </p>
                              </td>
                              <td className="p-3.5 text-xs text-[var(--muted)]">
                                {u.defaultZone || 'ph-gra'}
                              </td>
                              <td className="p-3.5">
                                <select
                                  disabled={dbUser.role !== 'owneradmin' || isSelf}
                                  value={u.role}
                                  onChange={(e) => void handleRoleChange(u.uid, e.target.value, u.isActive)}
                                  className="h-9 rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-2.5 text-xs disabled:opacity-50"
                                >
                                  <option value="customer">customer</option>
                                  <option value="dispatch">dispatch (driver)</option>
                                  <option value="staff">staff</option>
                                  <option value="owneradmin">owneradmin</option>
                                </select>
                              </td>
                              <td className="p-3.5">
                                <button
                                  type="button"
                                  disabled={dbUser.role !== 'owneradmin' || isSelf}
                                  onClick={() => void handleRoleChange(u.uid, u.role, !u.isActive)}
                                  className="rounded-full border border-[var(--line-2)] px-3.5 py-1 text-xs cursor-pointer disabled:opacity-50"
                                >
                                  {u.isActive ? 'Active' : 'Suspended'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  {usersDir && usersDir.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[var(--muted)]">
                      <span>
                        Showing {(usersDir.page - 1) * usersDir.pageSize + 1}–
                        {Math.min(usersDir.page * usersDir.pageSize, usersDir.total)} of {usersDir.total} users
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={usersDir.page <= 1}
                          onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                          className="inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--line-2)] bg-[var(--surface)] px-3 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          <span>Prev</span>
                        </button>
                        <span className="font-mono-num px-1">
                          Page {usersDir.page} / {usersDir.totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={usersDir.page >= usersDir.totalPages}
                          onClick={() => setUserPage((p) => Math.min(usersDir.totalPages, p + 1))}
                          className="inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--line-2)] bg-[var(--surface)] px-3 disabled:opacity-40 cursor-pointer"
                        >
                          <span>Next</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {settingsDraft && section === 'settings' && (
            <form onSubmit={handleSaveSettings} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 space-y-6">
              <h2 className="font-display text-2xl">Rivers State Delivery Zones &amp; Direct Bank Transfer</h2>
              <div className="space-y-3">
                {settingsDraft.riversZones.map((zone, idx) => (
                  <div
                    key={zone.id}
                    className="grid gap-3 sm:grid-cols-[1.5fr_140px_1fr] items-center rounded-xl border border-[var(--line)] p-3.5"
                  >
                    <span className="text-sm font-medium sm:font-normal">{zone.name}</span>
                    <input
                      type="number"
                      aria-label={`${zone.name} fee`}
                      value={zone.feeNgn}
                      onChange={(e) => {
                        const next = [...settingsDraft.riversZones];
                        next[idx] = { ...next[idx], feeNgn: Number(e.target.value) };
                        setSettingsDraft({ ...settingsDraft, riversZones: next });
                      }}
                      className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-2.5 text-sm font-mono-num"
                    />
                    <input
                      aria-label={`${zone.name} ETA`}
                      value={zone.etaText}
                      onChange={(e) => {
                        const next = [...settingsDraft.riversZones];
                        next[idx] = { ...next[idx], etaText: e.target.value };
                        setSettingsDraft({ ...settingsDraft, riversZones: next });
                      }}
                      className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-2.5 text-xs"
                    />
                  </div>
                ))}
              </div>

              <div className="border-t border-[var(--line)] pt-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h3 className="font-display text-xl">Direct Bank Transfer Receiving Account</h3>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsDraft.bankTransferEnabled}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, bankTransferEnabled: e.target.checked })
                      }
                    />
                    <span>Enable Direct Bank Transfer</span>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">Bank Name</label>
                    <input
                      value={settingsDraft.bankName}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, bankName: e.target.value })}
                      className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">Account Number</label>
                    <input
                      value={settingsDraft.bankAccountNumber}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, bankAccountNumber: e.target.value })}
                      className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">Account Name</label>
                    <input
                      value={settingsDraft.bankAccountName}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, bankAccountName: e.target.value })}
                      className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">Transfer Instructions</label>
                    <input
                      value={settingsDraft.bankTransferInstructions}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, bankTransferInstructions: e.target.value })
                      }
                      className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">Delivery Proof Mode</label>
                    <select
                      value={settingsDraft.deliveryProofMode}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          deliveryProofMode: e.target.value as CommerceSettings['deliveryProofMode'],
                        })
                      }
                      className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                    >
                      <option value="otp_photo">Customer OTP + Rider Photo (Both Required)</option>
                      <option value="otp">Customer OTP Code Only</option>
                      <option value="photo">Photo Proof Only</option>
                      <option value="rider_confirm">Rider Confirmation Only</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--line)] pt-5">
                <label className="block text-xs text-[var(--muted)] mb-1">
                  48-Hour Return Eligibility Conditions
                </label>
                <textarea
                  rows={3}
                  value={settingsDraft.returnEligibilityNotes}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, returnEligibilityNotes: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--line-2)] bg-[var(--bg)] p-3 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={dbUser.role !== 'owneradmin'}
                className="w-full sm:w-auto min-h-[44px] rounded-full bg-[var(--accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)] disabled:opacity-40 cursor-pointer"
              >
                Save Operational Settings
              </button>
            </form>
          )}

          {data && section === 'logs' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
                <h2 className="font-display text-2xl mb-3">Resend Email &amp; WhatsApp Feed</h2>
                <div className="divide-y divide-[var(--line)] text-xs space-y-2">
                  {data.notifications.map((n) => (
                    <div key={n.id} className="pt-2">
                      <div className="flex flex-wrap justify-between gap-2 font-medium">
                        <span>
                          <span className="uppercase text-[var(--accent)] mr-1.5">
                            {n.channel === 'email' ? 'Resend' : 'WhatsApp'}
                          </span>
                          · {n.eventType} · {n.entityId}
                        </span>
                        <span className="uppercase text-[var(--ok)]">{n.status}</span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mt-0.5">To: {n.recipientPhone}</p>
                      <p className="text-[var(--muted)] mt-1">{n.messageBody}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
                <h2 className="font-display text-2xl mb-3">Admin Audit Trail</h2>
                <div className="divide-y divide-[var(--line)] text-xs space-y-2">
                  {data.auditLogs.map((log) => (
                    <div key={log.id} className="pt-2 flex flex-wrap justify-between gap-2">
                      <div>
                        <span className="font-medium">{log.action}</span>
                        <span className="text-[var(--muted)] ml-2">
                          {log.entityType} #{log.entityId}
                        </span>
                      </div>
                      <span className="text-[var(--muted)]">{log.actorEmail || log.actorRole}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {receiptPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
          onClick={() => setReceiptPreview(null)}
        >
          <div
            className="w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-3xl border border-[var(--line-2)] bg-[var(--surface)] p-4 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
              <div className="min-w-0">
                <p className="font-mono-num text-sm font-medium">{receiptPreview.orderNumber}</p>
                <p className="text-xs text-[var(--muted)] truncate">
                  {receiptPreview.label || 'Transaction Code'}: {receiptPreview.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptPreview(null)}
                className="min-h-[40px] shrink-0 rounded-full border border-[var(--line-2)] px-4 py-1.5 text-xs uppercase cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-2">
              <img
                src={receiptPreview.image}
                alt={`${receiptPreview.label || 'Transfer receipt'} for ${receiptPreview.orderNumber}`}
                className="w-full h-auto rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}
      {addUserOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
          onClick={() => setAddUserOpen(false)}
        >
          <form
            onSubmit={handleProvisionUser}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-[var(--line-2)] bg-[var(--surface)] p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
              <div>
                <h2 className="font-display text-2xl">Add Driver or Team Member</h2>
                <p className="text-xs text-[var(--muted)]">
                  Pre-authorize an email; role activates when they sign up or sign in on the Account page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddUserOpen(false)}
                className="min-h-[36px] shrink-0 rounded-full border border-[var(--line-2)] px-3.5 text-xs uppercase cursor-pointer"
              >
                Close
              </button>
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Full Name</label>
              <input
                required
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="e.g. Tunde Balogun"
                className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Email Address</label>
              <input
                required
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="driver@rawhairs.ng"
                className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1">Phone (Optional)</label>
                <input
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  placeholder="+23480..."
                  className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1">Role</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as 'dispatch' | 'staff' | 'customer')}
                  className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
                >
                  <option value="dispatch">Dispatch Rider</option>
                  <option value="staff">Operations Staff</option>
                  <option value="customer">Customer</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Primary Rivers Zone</label>
              <select
                value={newUserZone}
                onChange={(e) => setNewUserZone(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm"
              >
                {(data?.settings.riversZones || []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={addingUser}
              className="w-full min-h-[44px] rounded-full bg-[var(--accent)] py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)] disabled:opacity-50 cursor-pointer"
            >
              {addingUser ? 'Adding...' : 'Authorize & Save'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
