import { api } from './client';

// ── Types ──────────────────────────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'completed' | 'absent' | 'late' | 'half-day';

export interface AttendanceMember {
  _id: string;
  user?: { name?: string; email?: string; phone?: string };
  branchCode?: string;
  secretCode?: string;
}

export interface AttendanceLocation {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
}

export interface AttendanceAuditLog {
  action?: string;
  performedBy?: string;
  timestamp?: string;
  details?: string;
  ipAddress?: string;
}

export interface AttendanceItem {
  _id: string;
  gymId: string;
  member?: AttendanceMember;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: AttendanceStatus;
  faceRecognitionMatched?: boolean | null;
  source?: 'app' | 'secret_code' | 'admin' | 'trainer' | 'scanner';
  scanner?: { _id: string; name?: string; deviceId?: string } | string;
  eventType?: 'fingerprint' | 'card' | 'pin' | 'face' | null;
  notes?: string;
  timezone?: string;
  location?: {
    checkIn?: AttendanceLocation;
    checkOut?: AttendanceLocation;
  };
  branchCode?: string;
  auditLogs?: AttendanceAuditLog[];
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendancePage {
  items: AttendanceItem[];
  page: number;
  limit: number;
  total: number;
}

// ── Params ─────────────────────────────────────────────────────────────────

export interface AttendanceListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: AttendanceStatus | 'all';
  date?: string;
  branchCode?: string;
}

export interface CheckInParams {
  member: string;
  branchCode?: string;
}

export interface UpdateAttendanceParams {
  status?: AttendanceStatus;
  notes?: string;
  checkIn?: string;
  checkOut?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildAttendanceQuery(params: AttendanceListParams): string {
  const parts: string[] = [];
  if (params.page) parts.push(`page=${params.page}`);
  if (params.limit) parts.push(`limit=${params.limit}`);
  if (params.search) parts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.status && params.status !== 'all') parts.push(`status=${encodeURIComponent(params.status)}`);
  if (params.date) parts.push(`date=${encodeURIComponent(params.date)}`);
  if (params.branchCode && params.branchCode !== 'ALL') parts.push(`branchCode=${encodeURIComponent(params.branchCode)}`);
  return parts.join('&');
}

// ── API Functions ──────────────────────────────────────────────────────────

export async function getAttendance(params: AttendanceListParams = {}): Promise<AttendancePage> {
  const qs = buildAttendanceQuery({ limit: 20, ...params });
  const res = await api.request<{ data?: { items?: AttendanceItem[]; page?: number; limit?: number; total?: number } }>(
    `/attendance?${qs}`,
    { auth: true },
  );
  return {
    items: res.data?.items ?? [],
    page: res.data?.page ?? 1,
    limit: res.data?.limit ?? 20,
    total: res.data?.total ?? 0,
  };
}

export async function getAttendanceById(attendanceId: string): Promise<AttendanceItem> {
  const res = await api.request<{ data?: AttendanceItem }>(`/attendance/${attendanceId}`, { auth: true });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function checkInAttendance(params: CheckInParams): Promise<AttendanceItem> {
  const res = await api.request<{ data?: AttendanceItem }>('/attendance/check-in', {
    method: 'POST',
    body: params,
    auth: true,
  });
  if (!res.data) {
    throw new Error('Failed to check in.');
  }
  return res.data;
}

export async function checkOutAttendance(attendanceId: string): Promise<AttendanceItem> {
  const res = await api.request<{ data?: AttendanceItem }>(`/attendance/check-out/${attendanceId}`, {
    method: 'PATCH',
    body: {},
    auth: true,
  });
  if (!res.data) {
    throw new Error('Failed to check out.');
  }
  return res.data;
}

export async function updateAttendance(
  attendanceId: string,
  params: UpdateAttendanceParams,
): Promise<AttendanceItem> {
  const res = await api.request<{ data?: AttendanceItem }>(`/attendance/${attendanceId}`, {
    method: 'PUT',
    body: params,
    auth: true,
  });
  if (!res.data) {
    throw new Error('Failed to update attendance.');
  }
  return res.data;
}

export async function deleteAttendance(attendanceId: string): Promise<void> {
  await api.request<{ success?: boolean }>(`/attendance/${attendanceId}`, {
    method: 'DELETE',
    auth: true,
  });
}
