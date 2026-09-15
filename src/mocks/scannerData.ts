// Mock data model for the Scanner Integration UI prototype.
// This is frontend-only: no values here are sent to any backend.

import { colors } from '../theme/colors';

export type ScannerConnectionMethod =
  | 'TCP/IP'
  | 'HTTP/API'
  | 'ADMS/PUSH'
  | 'USB'
  | 'LOCAL_GATEWAY'
  | 'OTHER';

export type ScannerStatus =
  | 'NOT_TESTED'
  | 'PENDING_HARDWARE_TEST'
  | 'DEMO_CONNECTED'
  | 'DEMO_FAILED'
  | 'OFFLINE';

export type ScannerStatusGroup = 'connected' | 'pending' | 'offline';

export interface MockScanner {
  id: string;
  name: string;
  model: string;
  branchId: string;
  branchName: string;
  connectionMethod: ScannerConnectionMethod;
  ipAddress?: string;
  port?: number;
  deviceId?: string;
  username?: string;
  password?: string;
  apiUrl?: string;
  serverUrl?: string;
  gatewayUrl?: string;
  pushKey?: string;
  apiKey?: string;
  status: ScannerStatus;
  lastTestedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScannerFormValues {
  name: string;
  model: string;
  branchId: string;
  branchName: string;
  connectionMethod: ScannerConnectionMethod;
  ipAddress: string;
  port: string;
  deviceId: string;
  username: string;
  password: string;
  apiUrl: string;
  serverUrl: string;
  gatewayUrl: string;
  pushKey: string;
  apiKey: string;
  notes: string;
}

export const SCANNER_MODEL_OPTIONS: string[] = ['eSSL K30 Pro', 'eSSL K30', 'ZKTeco', 'Other', 'Custom Device'];

export const CONNECTION_METHOD_OPTIONS: ScannerConnectionMethod[] = [
  'TCP/IP',
  'HTTP/API',
  'ADMS/PUSH',
  'USB',
  'LOCAL_GATEWAY',
  'OTHER',
];

export const CONNECTION_METHOD_LABELS: Record<ScannerConnectionMethod, string> = {
  'TCP/IP': 'TCP/IP',
  'HTTP/API': 'HTTP / API',
  'ADMS/PUSH': 'ADMS / Push',
  'USB': 'USB',
  'LOCAL_GATEWAY': 'Local Gateway',
  'OTHER': 'Other / Standard Protocol',
};

export const SCANNER_STATUS_META: Record<ScannerStatus, { label: string; color: string; group: ScannerStatusGroup }> = {
  DEMO_CONNECTED: { label: 'Demo Connected', color: colors.success, group: 'connected' },
  PENDING_HARDWARE_TEST: { label: 'Pending Test', color: '#f59e0b', group: 'pending' },
  NOT_TESTED: { label: 'Not Tested', color: colors.textMuted, group: 'pending' },
  DEMO_FAILED: { label: 'Demo Failed', color: colors.danger, group: 'offline' },
  OFFLINE: { label: 'Offline', color: colors.textMuted, group: 'offline' },
};

const STATUS_ORDERS: Record<ScannerStatus, number> = {
  DEMO_CONNECTED: 0,
  PENDING_HARDWARE_TEST: 1,
  NOT_TESTED: 2,
  DEMO_FAILED: 3,
  OFFLINE: 4,
};

export function sortScanners(list: MockScanner[]): MockScanner[] {
  return [...list].sort((a, b) => {
    const byStatus = STATUS_ORDERS[a.status] - STATUS_ORDERS[b.status];
    if (byStatus !== 0) return byStatus;
    return a.name.localeCompare(b.name);
  });
}

export interface MockBranch {
  id: string;
  branchCode: string;
  name: string;
}

export const MOCK_BRANCHES: MockBranch[] = [
  { id: 'br-main', branchCode: 'MAIN', name: 'A1 Fitness – Main' },
  { id: 'br-c', branchCode: 'BR02', name: 'A1 Fitness – Central' },
  { id: 'br-e', branchCode: 'BR03', name: 'A1 Fitness – Eastside' },
  { id: 'br-n', branchCode: 'BR04', name: 'A1 Fitness – North Point' },
];

export function resolveMockBranches(ownBranchCode?: string | null): MockBranch[] {
  const code = (ownBranchCode || '').trim().toUpperCase();
  const list = [...MOCK_BRANCHES];
  if (code && !list.some((b) => b.branchCode === code)) {
    list.unshift({ id: `br-${code.toLowerCase()}`, branchCode: code, name: `A1 Fitness – ${code}` });
  }
  return list;
}

export function findMockBranch(code?: string | null): MockBranch {
  const normalized = (code || '').trim().toUpperCase();
  return MOCK_BRANCHES.find((b) => b.branchCode === normalized) ?? MOCK_BRANCHES[0];
}

export function connectionIdentifier(s: Pick<MockScanner, 'connectionMethod' | 'ipAddress' | 'port' | 'apiUrl' | 'serverUrl' | 'gatewayUrl' | 'deviceId'>): string {
  switch (s.connectionMethod) {
    case 'TCP/IP':
      return s.ipAddress ? (s.port ? `${s.ipAddress}:${s.port}` : s.ipAddress) : 'No address set';
    case 'HTTP/API':
      return s.apiUrl || 'No API URL';
    case 'ADMS/PUSH':
      return s.serverUrl || 'No server URL';
    case 'LOCAL_GATEWAY':
      return s.gatewayUrl || 'No gateway URL';
    case 'USB':
      return s.deviceId ? `USB · ${s.deviceId}` : 'USB device';
    case 'OTHER':
    default:
      return 'Standard protocol';
  }
}

export function maskSecret(value?: string): string {
  if (!value) return '—';
  return '••••••••';
}

const IP_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const URL_REGEX = /^https?:\/\/\S+$/;

function isIpv4(value: string): boolean {
  const m = IP_REGEX.exec(value);
  if (!m) return false;
  return m.slice(1).every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
}

export function validateScannerValues(v: ScannerFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!v.name.trim()) errors.name = 'Scanner name is required.';
  if (!v.model.trim()) errors.model = 'Please choose a scanner model.';
  if (!v.branchId) errors.branchId = 'Please choose a branch.';

  switch (v.connectionMethod) {
    case 'TCP/IP':
      if (!v.ipAddress.trim()) errors.ipAddress = 'Device IP address is required.';
      else if (!isIpv4(v.ipAddress.trim())) errors.ipAddress = 'Enter a valid IPv4 address, e.g. 192.168.1.10.';
      if (!v.port.trim()) errors.port = 'Port is required.';
      else {
        const p = Number(v.port);
        if (!Number.isInteger(p) || p < 1 || p > 65535) errors.port = 'Port must be 1–65535.';
      }
      if (v.username.trim() && !v.password.trim()) errors.password = 'Password is required when a username is set.';
      break;
    case 'HTTP/API':
      if (!v.apiUrl.trim()) errors.apiUrl = 'API URL is required.';
      else if (!URL_REGEX.test(v.apiUrl.trim())) errors.apiUrl = 'API URL must start with http:// or https://.';
      if (v.username.trim() && !v.password.trim()) errors.password = 'Password / API key is required when a username is set.';
      break;
    case 'ADMS/PUSH':
      if (!v.serverUrl.trim()) errors.serverUrl = 'Server URL is required.';
      else if (!URL_REGEX.test(v.serverUrl.trim())) errors.serverUrl = 'Server URL must start with http:// or https://.';
      if (!v.pushKey.trim()) errors.pushKey = 'Push key / API key is required.';
      break;
    case 'LOCAL_GATEWAY':
      if (!v.gatewayUrl.trim()) errors.gatewayUrl = 'Gateway URL is required.';
      else if (!URL_REGEX.test(v.gatewayUrl.trim())) errors.gatewayUrl = 'Gateway URL must start with http:// or https://.';
      break;
    case 'USB':
    case 'OTHER':
      break;
  }

  return errors;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function nowIsoForStore(): string {
  return new Date().toISOString();
}

type CleanedScannerValues = {
  name: string;
  model: string;
  branchId: string;
  branchName: string;
  connectionMethod: ScannerConnectionMethod;
  ipAddress?: string;
  port?: number;
  deviceId?: string;
  username?: string;
  password?: string;
  apiUrl?: string;
  serverUrl?: string;
  gatewayUrl?: string;
  pushKey?: string;
  apiKey?: string;
  notes?: string;
};

export function trimScannerValues(v: ScannerFormValues): CleanedScannerValues {
  const t = (s: string) => s.trim();
  const portNum = Number(v.port);
  return {
    name: t(v.name),
    model: t(v.model),
    branchId: v.branchId,
    branchName: v.branchName,
    connectionMethod: v.connectionMethod,
    ipAddress: t(v.ipAddress) || undefined,
    port: v.port.trim() && Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535 ? portNum : undefined,
    deviceId: t(v.deviceId) || undefined,
    username: t(v.username) || undefined,
    password: t(v.password) || undefined,
    apiUrl: t(v.apiUrl) || undefined,
    serverUrl: t(v.serverUrl) || undefined,
    gatewayUrl: t(v.gatewayUrl) || undefined,
    pushKey: t(v.pushKey) || undefined,
    apiKey: t(v.apiKey) || undefined,
    notes: t(v.notes) || undefined,
  };
}

function makeSeedScanner(partial: Omit<MockScanner, 'id' | 'createdAt' | 'updatedAt'>): MockScanner {
  return { ...partial, id: 'seed-' + Math.random().toString(36).slice(2, 9), createdAt: nowIso(), updatedAt: nowIso() };
}

export function createSeedScanners(): MockScanner[] {
  const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const main = findMockBranch('MAIN');
  return [
    makeSeedScanner({
      name: 'Front Door',
      model: 'eSSL K30 Pro',
      branchId: main.id,
      branchName: main.name,
      connectionMethod: 'TCP/IP',
      ipAddress: '192.168.1.10',
      port: 8200,
      deviceId: 'K30-PRO-001',
      username: 'admin',
      password: 'demo-secret-1',
      status: 'DEMO_CONNECTED',
      lastTestedAt: yesterday,
      notes: 'Demo entry – sample TCP/IP configuration. Not connected to real hardware.',
    }),
    makeSeedScanner({
      name: 'Reception Counter',
      model: 'eSSL K30',
      branchId: 'br-c',
      branchName: 'A1 Fitness – Central',
      connectionMethod: 'ADMS/PUSH',
      serverUrl: 'https://push.example.com/adms',
      deviceId: 'K30-ADMS-004',
      pushKey: 'demo-push-key-2',
      status: 'NOT_TESTED',
      notes: 'Demo entry – added for the prototype. Real device verification will be added later.',
    }),
  ];
}