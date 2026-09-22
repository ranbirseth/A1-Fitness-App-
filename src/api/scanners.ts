import { api } from './client';

// Scanner devices (eSSL K30 Pro style fingerprint/card access terminals).

export type ScannerType = 'fingerprint' | 'card' | 'fingerprint_card' | 'face';
export type ScannerProtocol = 'tcp' | 'usb' | 'p2p';
export type ScannerStatus = 'online' | 'offline' | 'maintenance' | 'disabled';

export interface ScannerErrorLog {
  at?: string;
  level?: string;
  message?: string;
}

export interface ScannerItem {
  _id: string;
  gymId: string;
  branchCode: string;
  name: string;
  brand: string;
  model: string;
  deviceId: string;
  serial?: string;
  ipAddress?: string;
  port?: number;
  deviceTimezone?: string;
  protocol: ScannerProtocol;
  type: ScannerType;
  status: ScannerStatus;
  gates?: string[];
  settings?: {
    enforceMembership?: boolean;
    enableCheckOutOnSecondScan?: boolean;
  };
  lastSeen?: string | null;
  lastEventAt?: string | null;
  lastSync?: string | null;
  errorLogs?: ScannerErrorLog[];
  createdAt?: string;
  updatedAt?: string;
  apiKey?: string;
}

export interface ScannerCreatePayload {
  name: string;
  deviceId: string;
  serial?: string;
  brand?: string;
  model?: string;
  ipAddress?: string;
  port?: number;
  deviceTimezone?: string;
  protocol?: ScannerProtocol;
  type?: ScannerType;
  branchCode?: string;
  gates?: string[];
  settings?: { enforceMembership?: boolean; enableCheckOutOnSecondScan?: boolean };
}

export interface ScannerUpdatePayload {
  name?: string;
  brand?: string;
  model?: string;
  serial?: string;
  ipAddress?: string;
  port?: number;
  deviceTimezone?: string;
  protocol?: ScannerProtocol;
  type?: ScannerType;
  status?: ScannerStatus;
  gates?: string[];
  settings?: { enforceMembership?: boolean; enableCheckOutOnSecondScan?: boolean };
}

export interface ScannerPingResult {
  scannerId: string;
  deviceId: string;
  serial?: string | null;
  branchCode: string;
  status: 'online' | 'offline';
  lastSeen?: string | null;
  ageMs?: number | null;
  thresholdMs: number;
}

export interface ScannerSyncMember {
  memberId: string;
  name: string;
  secretCode: string;
  deviceUserId: string;
  cardId: string;
  active: boolean;
  membershipExpiryDate?: string | null;
  fingerprintCount: number;
}

export interface ScannerSyncPayload {
  scanner: string;
  count: number;
  members: ScannerSyncMember[];
}

export async function getScanners(params?: { branchCode?: string }): Promise<ScannerItem[]> {
  const qs = params?.branchCode ? `?branchCode=${encodeURIComponent(params.branchCode)}` : '';
  const res = await api.request<{ data?: ScannerItem[] }>(`/scanners${qs}`, { auth: true });
  return res.data ?? [];
}

export async function getScanner(scannerId: string): Promise<ScannerItem> {
  const res = await api.request<{ data?: ScannerItem }>(`/scanners/${scannerId}`, { auth: true });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function createScanner(payload: ScannerCreatePayload): Promise<ScannerItem> {
  const res = await api.request<{ data?: ScannerItem }>('/scanners', {
    method: 'POST',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function updateScanner(
  scannerId: string,
  payload: ScannerUpdatePayload
): Promise<ScannerItem> {
  const res = await api.request<{ data?: ScannerItem }>(`/scanners/${scannerId}`, {
    method: 'PATCH',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function disableScanner(scannerId: string): Promise<ScannerItem> {
  const res = await api.request<{ data?: ScannerItem }>(`/scanners/${scannerId}`, {
    method: 'DELETE',
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function rotateScannerKey(scannerId: string): Promise<{ apiKey: string }> {
  const res = await api.request<{ data?: { apiKey: string } }>(`/scanners/${scannerId}/rotate-key`, {
    method: 'POST',
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function getSyncPayload(scannerId: string): Promise<ScannerSyncPayload> {
  const res = await api.request<{ data?: ScannerSyncPayload }>(`/scanners/${scannerId}/sync-payload`, {
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}

export async function pingScanner(scannerId: string): Promise<ScannerPingResult> {
  const res = await api.request<{ data?: ScannerPingResult }>(`/scanners/${scannerId}/ping`, {
    method: 'POST',
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}