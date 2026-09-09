import { api } from './client';
import * as SecureStore from 'expo-secure-store';

const BRANCH_STORAGE_KEY = 'a1fitness.dashboard.branch';

export interface RevenueAnalytic {
  _id: string;
  total: number;
}

export interface RecentActivity {
  text: string;
  time: string;
  color: string;
}

export interface DashboardStats {
  totalMembers: number;
  activePlans: number;
  revenue: number;
  activeTrainers: number;
  attendanceToday: number;
  revenueAnalytics: RevenueAnalytic[];
  recentActivities: RecentActivity[];
  branchCode: string;
}

export interface Branch {
  _id: string;
  branchCode: string;
  name: string;
}

const defaultStats: DashboardStats = {
  totalMembers: 0,
  activePlans: 0,
  revenue: 0,
  activeTrainers: 0,
  attendanceToday: 0,
  revenueAnalytics: [],
  recentActivities: [],
  branchCode: 'ALL',
};

export async function getDashboardStats(branchCode: string): Promise<DashboardStats> {
  try {
    const res = await api.request<{ data?: Partial<DashboardStats>; success?: boolean }>(
      `/dashboard/stats?branchCode=${encodeURIComponent(branchCode)}`,
      { auth: true }
    );
    return { ...defaultStats, ...res.data };
  } catch {
    throw new Error('Failed to load dashboard data. Please try again.');
  }
}

export async function getBranches(): Promise<Branch[]> {
  try {
    const res = await api.request<{
      data?: { items?: Branch[] };
      success?: boolean;
    }>('/branches?limit=100', { auth: true });
    return res.data?.items ?? [];
  } catch {
    return [];
  }
}

export async function getSavedBranch(): Promise<string> {
  try {
    const val = await SecureStore.getItemAsync(BRANCH_STORAGE_KEY);
    return val || 'ALL';
  } catch {
    return 'ALL';
  }
}

export async function saveBranch(branchCode: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(BRANCH_STORAGE_KEY, branchCode);
  } catch {
    // Best effort
  }
}
