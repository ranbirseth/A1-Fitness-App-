import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';
import { type DashboardStats, getDashboardStats } from '../api/dashboard';
import { useDrawer } from '../components/drawer/DrawerContext';

function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN');
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

type LoadingMode = 'initial' | 'refresh' | 'idle';

export function AdminDashboardScreen() {
  const { user, logout } = useAuth();
  const { open, setActive } = useDrawer();

  useEffect(() => {
    setActive('Dashboard');
  }, [setActive]);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<LoadingMode>('initial');
  const [error, setError] = useState<string | null>(null);

  const branchCode = user?.branchCode || '';

  const fetchStats = useCallback(
    async (mode: LoadingMode) => {
      setLoading(mode);
      setError(null);
      try {
        const data = await getDashboardStats(branchCode);
        setStats(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load dashboard data.';
        setError(msg);
      } finally {
        setLoading('idle');
      }
    },
    [branchCode]
  );

  useEffect(() => {
    fetchStats('initial');
  }, [fetchStats]);

  const onRefresh = useCallback(() => {
    fetchStats('refresh');
  }, [fetchStats]);

  const onLogout = useCallback(() => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  }, [logout]);

  const revenueData = stats?.revenueAnalytics ?? [];
  const hasRevenueData = revenueData.length > 0 && revenueData.some((r) => r.total > 0);
  const maxRevenue = Math.max(...revenueData.map((r) => r.total), 1);

  const activities = (stats?.recentActivities ?? []).slice(0, 5);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.menuButton} onPress={open} activeOpacity={0.7} hitSlop={8}>
          <Text style={styles.menuButtonText}>☰</Text>
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>A1 FITNESS</Text>
          <Text style={styles.subtitle}>Welcome back! Your branch dashboard.</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.branchBadge}>
            <Text style={styles.branchBadgeLabel}>Branch</Text>
            <Text style={styles.branchBadgeCode} numberOfLines={1}>
              {branchCode || '-'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
            activeOpacity={0.7}
            disabled={loading !== 'idle' && loading !== 'refresh'}
          >
            <Text style={styles.refreshButtonText}>↻</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {loading === 'initial' && !stats ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading dashboard…</Text>
        </View>
      ) : error && !stats ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={loading === 'refresh'}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Refresh indicator overlay */}
          {loading === 'refresh' && (
            <View style={styles.refreshOverlay}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}

          {/* KPI Cards */}
          <Text style={styles.sectionTitle}>Dashboard Overview</Text>
          <View style={styles.kpiGrid}>
            <KpiCard
              label="Total Members"
              value={String(stats?.totalMembers ?? 0)}
              desc="Registered members"
              icon="👥"
            />
            <KpiCard
              label="Active Plans"
              value={String(stats?.activePlans ?? 0)}
              desc="Members with active plans"
              icon="📋"
            />
            <KpiCard
              label="Monthly Revenue"
              value={formatINR(stats?.revenue ?? 0)}
              desc="Branch Total"
              icon="💰"
              valueColor={colors.success}
            />
            <KpiCard
              label="Active Trainers"
              value={String(stats?.activeTrainers ?? 0)}
              desc="On system"
              icon="🏋️"
            />
            <KpiCard
              label="Attendance Today"
              value={String(stats?.attendanceToday ?? 0)}
              desc="Check-ins today"
              icon="✅"
            />
          </View>

          {/* Revenue Chart */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Revenue Analytics (Last 7 Days)</Text>
            {!hasRevenueData ? (
              <Text style={styles.emptyText}>No revenue recorded for the last 7 days</Text>
            ) : (
              <View style={styles.chartContainer}>
                {revenueData.map((item, idx) => {
                  const pct = maxRevenue > 0 ? (item.total / maxRevenue) * 100 : 0;
                  const barHeight = item.total > 0 ? Math.max(pct, 5) : 0;
                  return (
                    <View key={item._id + idx} style={styles.barWrapper}>
                      <Text style={styles.barValue}>
                        {item.total > 0 ? formatINR(item.total) : ''}
                      </Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.bar,
                            {
                              height: `${barHeight}%` as unknown as number,
                              minHeight: barHeight > 0 ? 8 : 0,
                              backgroundColor:
                                item.total > 0 ? colors.accent : 'transparent',
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.barLabel}>{formatShortDate(item._id)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Recent Activities */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Activities</Text>
            {activities.length === 0 ? (
              <Text style={styles.emptyText}>No recent activity found.</Text>
            ) : (
              <View style={styles.activityList}>
                {activities.map((act, idx) => (
                  <View key={idx} style={styles.activityRow}>
                    <View
                      style={[styles.activityDot, { backgroundColor: act.color || colors.primary }]}
                    />
                    <View style={styles.activityContent}>
                      <Text style={styles.activityText}>{act.text}</Text>
                      <Text style={styles.activityTime}>{relativeTime(act.time)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.8}>
            <Text style={styles.logoutButtonText}>Log out</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ---------- KPI Card ---------- */

function KpiCard({
  label,
  value,
  desc,
  icon,
  valueColor,
}: {
  label: string;
  value: string;
  desc: string;
  icon: string;
  valueColor?: string;
}) {
  return (
    <View style={kpiStyles.card}>
      <View style={kpiStyles.topRow}>
        <Text style={kpiStyles.icon}>{icon}</Text>
        <Text style={kpiStyles.label}>{label}</Text>
      </View>
      <Text style={[kpiStyles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
      <Text style={kpiStyles.desc}>{desc}</Text>
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  desc: {
    color: colors.textFaint,
    fontSize: 12,
  },
});

/* ---------- Screen Styles ---------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0b10',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(30,32,44,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuButtonText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  logo: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  branchBadge: {
    backgroundColor: 'rgba(30,32,44,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 160,
  },
  branchBadgeLabel: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  branchBadgeCode: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(30,32,44,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  refreshOverlay: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: 12,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
    color: colors.textFaint,
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  kpiGrid: {
    marginBottom: 20,
  },
  card: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  emptyText: {
    color: colors.textFaint,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },

  /* Revenue chart */
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 180,
    paddingTop: 24,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    paddingHorizontal: 2,
  },
  barValue: {
    color: colors.textMuted,
    fontSize: 9,
    marginBottom: 4,
    textAlign: 'center',
  },
  barTrack: {
    width: '70%',
    height: 120,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    borderRadius: 6,
  },
  barLabel: {
    color: colors.textFaint,
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
  },

  /* Activities */
  activityList: {
    gap: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  activityTime: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 2,
  },

  logoutButton: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  logoutButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
});
