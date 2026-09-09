import { api } from './client';

export interface AdminItem {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  branchCode: string;
  createdAt?: string;
}

export interface AdminCreatePayload {
  name: string;
  email: string;
  phone?: string;
  password?: string;
  branchCode: string;
}

export interface AdminUpdatePayload {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  branchCode?: string;
  status?: string;
}

export async function getAdmins(search?: string): Promise<AdminItem[]> {
  const term = search?.trim();
  const query = term ? `/admins?search=${encodeURIComponent(term)}&limit=100` : '/admins?limit=100';
  const res = await api.request<{ data?: { items?: AdminItem[] } }>(query, { auth: true });
  return res.data?.items ?? [];
}

export async function createAdmin(payload: AdminCreatePayload): Promise<AdminItem> {
  const res = await api.request<{ data?: AdminItem }>('/admins', {
    method: 'POST',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function updateAdmin(
  adminId: string,
  payload: AdminUpdatePayload
): Promise<AdminItem> {
  const res = await api.request<{ data?: AdminItem }>(`/admins/${adminId}`, {
    method: 'PATCH',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function deleteAdmin(adminId: string): Promise<void> {
  await api.request<{ success?: boolean }>(`/admins/${adminId}`, {
    method: 'DELETE',
    auth: true,
  });
}