import { api } from './client';

// Super Admin Members module.
//
// API contract notes (backend `A1-fitness/server`):
// - Success envelope: { success, message, data }.
// - List envelope:    { items, page, limit, total }.
// - POST/PUT /api/members accept JSON (the web client sends JSON and the
//   multipart `photo` handling is skipped when Content-Type is JSON).
// - Assign/renew/upgrade set paymentStatus to "pending" and isActivePlan to
//   false. The atomic endpoint also creates the Payment record when payment
//   fields (amount, method, status) are included in the request body.

export type MemberStatus =
  | 'pending'
  | 'active'
  | 'expired'
  | 'frozen'
  | 'cancelled'
  | 'inactive';

export interface MemberUser {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  photo?: string;
  branchCode?: string;
}

export interface MemberTrainer {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  branchCode?: string;
  status?: string;
}

export interface MemberPlan {
  _id: string;
  name: string;
  price: number;
  duration: number;
  features?: string[];
  branchCode?: string | null;
}

export interface MemberBiometrics {
  deviceUserId?: string;
  cardId?: string;
  fingerprints?: string[];
}

export interface MemberItem {
  _id: string;
  secretCode?: string;
  branchCode: string;
  status: string;
  paymentStatus: string;
  isActivePlan?: boolean;
  membershipStartDate?: string;
  membershipExpiryDate?: string;
  frozenAt?: string | null;
  remainingDays?: number | null;
  createdAt?: string;
  user?: MemberUser;
  trainer?: MemberTrainer | null;
  currentPlan?: MemberPlan | null;
  biometrics?: MemberBiometrics;
}

/**
 * Returns true when the member's subscription action (Assign/Renew) should be
 * available, i.e. when they do NOT already have a healthy current plan that
 * expires more than 7 days from today.
 *
 * Rules:
 * - No current plan → true (show action)
 * - isActivePlan explicitly false → true
 * - membershipExpiryDate missing / invalid → true (preserve access)
 * - Expiry > 7 days away → false (hide action — subscription is healthy)
 * - Expiry ≤ 7 days away or already past → true (show action)
 */
export function showSubscriptionAction(member: MemberItem): boolean {
  if (!member.currentPlan) return true;
  if (member.isActivePlan === false) return true;
  if (!member.membershipExpiryDate) return true;
  const expiry = new Date(member.membershipExpiryDate);
  if (Number.isNaN(expiry.getTime())) return true;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const daysLeft = (expiry.getTime() - Date.now()) / MS_PER_DAY;
  return daysLeft <= 7;
}

export interface MemberPage {
  items: MemberItem[];
  page: number;
  limit: number;
  total: number;
}

export interface MemberListParams {
  search?: string;
  status?: string;
  branchCode?: string;
  limit?: number;
}

export interface MemberCreatePayload {
  name: string;
  email?: string;
  phone?: string;
  password?: string;
  trainerId?: string;
  planId?: string;
  membershipStartDate?: string;
  branchCode?: string;
}

export interface MemberUpdatePayload {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  trainerId?: string | null;
  status?: string;
  branchCode?: string;
  biometrics?: MemberBiometrics;
}

export async function updateMemberBiometrics(
  memberId: string,
  biometrics: MemberBiometrics
): Promise<MemberItem> {
  return updateMember(memberId, { biometrics });
}

/**
 * Links (or clears) the eSSL/ZKTeco terminal User ID assigned to a member on the
 * physical device panel. The ADMS protocol uses this User ID to resolve punches
 * back to the Member record.
 */
export async function linkBiometric(
  memberId: string,
  deviceUserId: string
): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(
    `/members/${memberId}/link-biometric`,
    { method: 'POST', body: { deviceUserId }, auth: true }
  );
  return unwrapMember(res);
}

export interface PlanItem {
  _id: string;
  name: string;
  price: number;
  duration: number;
  features?: string[];
  branchCode?: string | null;
}

export interface TrainerItem {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  branchCode?: string;
  status?: string;
}

export interface PaymentPayload {
  member: string;
  plan: string;
  amount: number;
  method?: 'cash' | 'card' | 'upi' | 'online';
  status?: 'paid' | 'pending';
  note?: string;
  date?: string;
}

// Builds a query string, dropping empty/"all"-style filters that the backend
// treats as "no filter".
function buildQuery(params: Record<string, string | number | undefined>, limit = 100): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (!str) continue;
    if (key !== 'search' && (str === 'all' || str === 'ALL')) continue;
    if (key !== 'search') parts.push(`${key}=${encodeURIComponent(str)}`);
    else parts.push(`search=${encodeURIComponent(str)}`);
  }
  parts.push(`limit=${limit}`);
  return parts.join('&');
}

export async function getMembers(params: MemberListParams = {}): Promise<MemberPage> {
  const qs = buildQuery({
    search: params.search,
    status: params.status,
    branchCode: params.branchCode,
  } as Record<string, string | undefined>, params.limit);
  const res = await api.request<{ data?: { items?: MemberItem[]; page?: number; limit?: number; total?: number } }>(
    `/members?${qs}`,
    { auth: true }
  );
  return {
    items: res.data?.items ?? [],
    page: res.data?.page ?? 1,
    limit: res.data?.limit ?? 0,
    total: res.data?.total ?? 0,
  };
}

export async function getMember(memberId: string): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(`/members/${memberId}`, { auth: true });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function createMember(payload: MemberCreatePayload): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>('/members', {
    method: 'POST',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function updateMember(
  memberId: string,
  payload: MemberUpdatePayload
): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(`/members/${memberId}`, {
    method: 'PUT',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function deleteMember(memberId: string): Promise<void> {
  await api.request<{ success?: boolean }>(`/members/${memberId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export async function approveMember(memberId: string): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(`/members/${memberId}/approve`, {
    method: 'PATCH',
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export interface MembershipPaymentInfo {
  amount?: number;
  method?: 'cash' | 'card' | 'upi' | 'online';
  status?: 'paid' | 'pending';
  note?: string;
}

// Payment details nested inside `payment` mirror the working React.js web
// API contract. The backend reads `body.payment`, and each membership
// operation (assign/renew/upgrade) creates membership + Payment atomically —
// the client must NOT issue a separate POST /payments.
export interface MembershipPaymentPayload {
  amount?: number;
  method?: 'cash' | 'card' | 'upi' | 'online';
  status?: 'paid' | 'pending';
  note?: string;
  /** Stable per-operation key; reused across retries, cleared on completion. */
  idempotencyKey?: string;
}

function unwrapMember(res: { data?: MemberItem }): MemberItem {
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function assignPlan(
  memberId: string,
  body: { planId: string; membershipStartDate?: string; payment?: MembershipPaymentPayload }
): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(`/members/${memberId}/assign-plan`, {
    method: 'PATCH',
    body,
    auth: true,
  });
  return unwrapMember(res);
}

export async function renewPlan(
  memberId: string,
  body: { planId?: string; payment?: MembershipPaymentPayload }
): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(`/members/${memberId}/renew-plan`, {
    method: 'PATCH',
    body,
    auth: true,
  });
  return unwrapMember(res);
}

export async function upgradePlan(
  memberId: string,
  body: { planId: string; payment?: MembershipPaymentPayload }
): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(`/members/${memberId}/upgrade-plan`, {
    method: 'PATCH',
    body,
    auth: true,
  });
  return unwrapMember(res);
}

export async function cancelPlan(memberId: string): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(`/members/${memberId}/cancel-plan`, {
    method: 'PATCH',
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function freezePlan(memberId: string): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(`/members/${memberId}/freeze-plan`, {
    method: 'PATCH',
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function resumePlan(memberId: string): Promise<MemberItem> {
  const res = await api.request<{ data?: MemberItem }>(`/members/${memberId}/resume-plan`, {
    method: 'PATCH',
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function getPlans(branchCode?: string, limit = 100): Promise<PlanItem[]> {
  const qs = buildQuery({ branchCode } as Record<string, string | undefined>, limit);
  const res = await api.request<{ data?: { items?: PlanItem[] } }>(`/plans?${qs}`, { auth: true });
  return res.data?.items ?? [];
}

export async function getTrainers(branchCode?: string, limit = 100): Promise<TrainerItem[]> {
  const qs = branchCode
    ? `branchCode=${encodeURIComponent(branchCode.trim())}&limit=${limit}`
    : `limit=${limit}`;
  const res = await api.request<{ data?: { items?: TrainerItem[] } }>(`/trainers?${qs}`, { auth: true });
  return res.data?.items ?? [];
}

export async function recordPayment(payload: PaymentPayload): Promise<void> {
  await api.request<{ data?: unknown }>('/payments', {
    method: 'POST',
    body: payload,
    auth: true,
  });
}