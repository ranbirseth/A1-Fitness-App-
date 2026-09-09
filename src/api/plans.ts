import { api } from './client';

export interface PlanItem {
  _id: string;
  gymId: string;
  name: string;
  price: number;
  duration: number;
  features: string[];
  branchCode: string | null;
  appliedBranches: string[];
  createdAt: string;
  __v: number;
}

export interface PlanBranch {
  _id: string;
  gymId: string;
  planId: string;
  branchCode: string;
  status: 'active' | 'inactive';
}

export interface PlanPage {
  items: PlanItem[];
  total: number;
  page: number;
  limit: number;
}

export interface PlanCreatePayload {
  name: string;
  price: number;
  duration: number;
  features?: string[];
}

export interface PlanUpdatePayload {
  name?: string;
  price?: number;
  duration?: number;
  features?: string[];
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (!str) continue;
    if (str === 'all' || str === 'ALL') continue;
    parts.push(`${key}=${encodeURIComponent(str)}`);
  }
  return parts.join('&');
}

export async function listPlans(params: { search?: string; branchCode?: string; limit?: number } = {}): Promise<PlanPage> {
  const qs = buildQuery({
    search: params.search,
    branchCode: params.branchCode,
  });
  const suffix = qs ? `?${qs}&limit=${params.limit ?? 100}` : `?limit=${params.limit ?? 100}`;
  const res = await api.request<{ data?: { items?: PlanItem[]; total?: number; page?: number; limit?: number } }>(
    `/plans${suffix}`,
    { auth: true }
  );
  return {
    items: res.data?.items ?? [],
    total: res.data?.total ?? 0,
    page: res.data?.page ?? 1,
    limit: res.data?.limit ?? 100,
  };
}

export async function createPlan(payload: PlanCreatePayload): Promise<PlanItem> {
  const res = await api.request<{ data?: PlanItem }>('/plans', {
    method: 'POST',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function updatePlan(planId: string, payload: PlanUpdatePayload): Promise<PlanItem> {
  const res = await api.request<{ data?: PlanItem }>(`/plans/${planId}`, {
    method: 'PATCH',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function deletePlan(planId: string): Promise<void> {
  await api.request<{ success?: boolean }>(`/plans/${planId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export async function applyPlanToBranch(planId: string, branchCode: string): Promise<PlanBranch> {
  const res = await api.request<{ data?: PlanBranch }>(`/plans/${planId}/branches`, {
    method: 'POST',
    body: { branchCode },
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function removePlanFromBranch(planId: string, branchCode: string): Promise<void> {
  await api.request<{ success?: boolean }>(`/plans/${planId}/branches`, {
    method: 'DELETE',
    body: { branchCode },
    auth: true,
  });
}

export async function getPlanBranches(planId: string): Promise<PlanBranch[]> {
  const res = await api.request<{ data?: PlanBranch[] }>(`/plans/${planId}/branches`, {
    auth: true,
  });
  return res.data ?? [];
}
