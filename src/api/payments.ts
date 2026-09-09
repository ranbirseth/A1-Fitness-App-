import { api } from './client';
import { API_BASE_URL } from '../config/api';
import { getSession } from '../auth/session';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PaymentMember {
  _id: string;
  user?: { _id: string; name: string; email?: string; phone?: string };
  branchCode?: string;
  secretCode?: string;
  membershipStartDate?: string;
  membershipExpiryDate?: string;
  paymentStatus?: string;
  status?: string;
}

export interface PaymentPlan {
  _id: string;
  name?: string;
  price?: number;
  duration?: number;
}

export interface PaymentItem {
  _id: string;
  invoiceNumber?: string;
  amount: number;
  method?: string;
  status: string;
  date?: string;
  createdAt?: string;
  note?: string;
  operationType?: string;
  branchCode?: string;
  membershipStartDate?: string;
  membershipExpiryDate?: string;
  member?: PaymentMember;
  plan?: PaymentPlan;
}

export interface PaymentPage {
  items: PaymentItem[];
  page: number;
  limit: number;
  total: number;
}

export interface PaymentListParams {
  page?: number;
  limit?: number;
  status?: string;
  method?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  branchCode?: string;
  businessStatus?: string;
}

export interface AnalyticsKpis {
  totalRevenue: number;
  totalTransactions: number;
  paidRevenue: number;
  pendingRevenue: number;
  pendingPaymentsCount: number;
  newMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  renewalsCount: number;
  expiringCount: number;
  expiredCount: number;
  attendanceCount: number;
  avgRevenuePerTransaction: number;
}

export interface AnalyticsBreakdown {
  _id: string;
  total?: number;
  count: number;
  name?: string;
}

export interface AnalyticsOverview {
  kpis: AnalyticsKpis;
  series: {
    labels: string[];
    revenue: number[];
    revenueCounts: number[];
    newMembers: number[];
    attendance: number[];
  };
  breakdowns: {
    revenueByMethod: AnalyticsBreakdown[];
    revenueByStatus: AnalyticsBreakdown[];
    revenueByPlan: AnalyticsBreakdown[];
    membersByStatus: AnalyticsBreakdown[];
    membersByPlan: AnalyticsBreakdown[];
    attendanceByStatus: AnalyticsBreakdown[];
    paymentsByStatus: AnalyticsBreakdown[];
  };
  range: { start: string; end: string };
  filters: Record<string, unknown>;
}

export interface InvoiceData {
  _id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  paymentDate: string | null;
  status: string;
  method: string;
  referenceId: string;
  note: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  lineItems: Array<{
    description: string;
    details: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  billingPeriod: { start: string; end: string };
  business: {
    name: string;
    displayName: string;
    tagline: string;
    phone: string;
    email: string;
    website: string;
    currency: string;
    currencySymbol: string;
  };
  member: {
    _id: string;
    memberId: string | null;
    branchCode: string;
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  plan: {
    _id: string;
    name: string;
    duration: number | null;
    price: number;
  };
}

export interface ReminderSummary {
  eligible: number;
  inAppSent: number;
  whatsappReady: number;
  whatsappSkipped: number;
  duplicatesSkipped: number;
  whatsappStatus: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildPaymentQuery(params: PaymentListParams): string {
  const parts: string[] = [];
  if (params.page) parts.push(`page=${params.page}`);
  if (params.limit) parts.push(`limit=${params.limit}`);
  if (params.status && params.status !== 'all') parts.push(`status=${encodeURIComponent(params.status)}`);
  if (params.method && params.method !== 'all') parts.push(`method=${encodeURIComponent(params.method)}`);
  if (params.dateFrom) parts.push(`dateFrom=${encodeURIComponent(params.dateFrom)}`);
  if (params.dateTo) parts.push(`dateTo=${encodeURIComponent(params.dateTo)}`);
  if (params.q) parts.push(`q=${encodeURIComponent(params.q)}`);
  if (params.branchCode && params.branchCode !== 'ALL') parts.push(`branchCode=${encodeURIComponent(params.branchCode)}`);
  if (params.businessStatus && params.businessStatus !== 'all') parts.push(`businessStatus=${encodeURIComponent(params.businessStatus)}`);
  return parts.join('&');
}

// ── API Functions ──────────────────────────────────────────────────────────

export async function getPayments(params: PaymentListParams = {}): Promise<PaymentPage> {
  const qs = buildPaymentQuery({ limit: 20, ...params });
  const res = await api.request<{ data?: { items?: PaymentItem[]; page?: number; limit?: number; total?: number } }>(
    `/payments?${qs}`,
    { auth: true }
  );
  return {
    items: res.data?.items ?? [],
    page: res.data?.page ?? 1,
    limit: res.data?.limit ?? 20,
    total: res.data?.total ?? 0,
  };
}

export async function getAnalyticsOverview(params: {
  dateFrom?: string;
  dateTo?: string;
  branchCode?: string;
} = {}): Promise<AnalyticsOverview> {
  const parts: string[] = [];
  if (params.dateFrom) parts.push(`dateFrom=${encodeURIComponent(params.dateFrom)}`);
  if (params.dateTo) parts.push(`dateTo=${encodeURIComponent(params.dateTo)}`);
  if (params.branchCode && params.branchCode !== 'ALL') parts.push(`branchCode=${encodeURIComponent(params.branchCode)}`);
  const qs = parts.join('&');
  const res = await api.request<{ data?: AnalyticsOverview }>(
    `/analytics/overview${qs ? '?' + qs : ''}`,
    { auth: true }
  );
  if (!res.data) {
    throw new Error('Failed to load analytics data.');
  }
  return res.data;
}

export async function getInvoice(paymentId: string): Promise<InvoiceData> {
  const res = await api.request<{ data?: InvoiceData }>(`/payments/${paymentId}/invoice`, { auth: true });
  if (!res.data) {
    throw new Error('Failed to load invoice.');
  }
  return res.data;
}

export async function markAsPaid(paymentId: string): Promise<PaymentItem> {
  const res = await api.request<{ data?: PaymentItem }>(`/payments/${paymentId}/paid`, {
    method: 'PATCH',
    auth: true,
  });
  if (!res.data) {
    throw new Error('Failed to mark payment as paid.');
  }
  return res.data;
}

export async function markAsUnpaid(paymentId: string): Promise<PaymentItem> {
  const res = await api.request<{ data?: PaymentItem }>(`/payments/${paymentId}/unpaid`, {
    method: 'PATCH',
    auth: true,
  });
  if (!res.data) {
    throw new Error('Failed to mark payment as unpaid.');
  }
  return res.data;
}

export async function sendReminders(branchCode?: string): Promise<ReminderSummary> {
  const qs = branchCode && branchCode !== 'ALL' ? `?branchCode=${encodeURIComponent(branchCode)}` : '';
  const res = await api.request<{ data?: ReminderSummary }>(`/payments/reminders${qs}`, {
    method: 'POST',
    body: {},
    auth: true,
  });
  if (!res.data) {
    throw new Error('Failed to send reminders.');
  }
  return res.data;
}

export async function downloadInvoicePDF(paymentId: string): Promise<string | null> {
  try {
    const session = await getSession();
    const url = `${API_BASE_URL}/payments/${paymentId}/pdf`;
    const headers: Record<string, string> = {};
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) return null;

    const blob = await response.blob();
    const reader = new FileReader();
    return new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
