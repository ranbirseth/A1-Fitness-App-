import { api } from './client';

export interface BranchItem {
  _id: string;
  name: string;
  branchCode: string;
  address?: string;
  phone?: string;
  email?: string;
  status: string;
}

export interface BranchCreatePayload {
  name: string;
  branchCode: string;
  address?: string;
  phone?: string;
  email?: string;
  status?: string;
}

export interface BranchUpdatePayload {
  name?: string;
  branchCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  status?: string;
}

export interface BranchKpis {
  totalMembers: number;
  activeMembers: number;
  staff: number;
  revenue: number;
  payments: number;
  attendance: number;
  activeMemberships: number;
  expiringMemberships: number;
  expiredMemberships: number;
}

export interface BranchOverview {
  branch: BranchItem;
  kpis: BranchKpis;
  plans: Array<{ _id?: string; name?: string; count: number }>;
}

export interface BranchMemberItem {
  _id: string;
  status: string;
  membershipExpiryDate?: string;
  user?: { name?: string };
  currentPlan?: { name?: string };
}

export interface StaffItem {
  _id: string;
  name: string;
  role: string;
  status: string;
}

export interface PaymentItem {
  _id: string;
  invoiceNumber?: string;
  amount: number;
  status: string;
}

export async function getBranches(limit = 100): Promise<BranchItem[]> {
  const res = await api.request<{ data?: { items?: BranchItem[] } }>(
    `/branches?limit=${limit}`,
    { auth: true }
  );
  return res.data?.items ?? [];
}

export async function getBranchOverview(branchId: string): Promise<BranchOverview> {
  const res = await api.request<{ data?: BranchOverview }>(
    `/branches/${branchId}/overview`,
    { auth: true }
  );
  if (!res.data) {
    throw new Error('Unable to load branch data.');
  }
  return res.data;
}

export async function createBranch(payload: BranchCreatePayload): Promise<BranchItem> {
  const res = await api.request<{ data?: BranchItem }>('/branches', {
    method: 'POST',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function updateBranch(
  branchId: string,
  payload: BranchUpdatePayload
): Promise<BranchItem> {
  const res = await api.request<{ data?: BranchItem }>(`/branches/${branchId}`, {
    method: 'PATCH',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function deleteBranch(branchId: string): Promise<void> {
  await api.request<{ success?: boolean }>(`/branches/${branchId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export async function getBranchMembers(
  branchCode: string,
  limit = 10
): Promise<BranchMemberItem[]> {
  const res = await api.request<{ data?: { items?: BranchMemberItem[] } }>(
    `/members?limit=${limit}&branchCode=${encodeURIComponent(branchCode)}`,
    { auth: true }
  );
  return res.data?.items ?? [];
}

export async function getBranchTrainers(branchCode: string): Promise<StaffItem[]> {
  const res = await api.request<{ data?: { items?: StaffItem[] } }>(
    `/trainers?branchCode=${encodeURIComponent(branchCode)}`,
    { auth: true }
  );
  return res.data?.items ?? [];
}

export async function getBranchPayments(
  branchCode: string,
  limit = 10
): Promise<PaymentItem[]> {
  const res = await api.request<{ data?: { items?: PaymentItem[] } }>(
    `/payments?limit=${limit}&branchCode=${encodeURIComponent(branchCode)}`,
    { auth: true }
  );
  return res.data?.items ?? [];
}