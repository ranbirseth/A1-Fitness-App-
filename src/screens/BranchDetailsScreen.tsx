import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import {
  type BranchMemberItem,
  type BranchOverview,
  type PaymentItem,
  type StaffItem,
  getBranchMembers,
  getBranchOverview,
  getBranchPayments,
  getBranchTrainers,
} from '../api/branches';
import { StatusBadge } from '../components/StatusBadge';
import { useDrawer } from '../components/drawer/DrawerContext';
import type { AppStackParamList } from '../navigation/types';

function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '-';
  }
}

export function BranchDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { branchId } = useRoute<RouteProp<AppStackParamList, 'BranchDetails'>>().params;
  const { setActive } = useDrawer();

  useEffect(() => {
    setActive('Branches');
  }, [setActive]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<BranchOverview | null>(null);
  const [members, setMembers] = useState<BranchMemberItem[]>([]);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);

  const loadData = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    setError(null);
    try {
      const ov = await getBranchOverview(branchId);
      setOverview(ov);
      const bc = ov.branch.branchCode;
      const [mems, trs, pays] = await Promise.all([
        getBranchMembers(bc, 10),
        getBranchTrainers(bc),
        getBranchPayments(bc, 10),
      ]);
      setMembers(mems);
      setStaff(trs);
      setPayments(pays);
    } catch {
      setError('Unable to load branch data.');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadData('initial');
  }, [loadData]);

  if (loading && !overview) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backText}>← Back to Branches</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading branch data…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !overview) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backText}>← Back to Branches</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadData('initial')}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const branch = overview!.branch;
  const kpis = overview!.kpis;
  const plans = overview!.plans;

  const kpiRows: Array<[string, string | number]> = [
    ['Members', kpis.totalMembers],
    ['Active Members', kpis.activeMembers],
    ['Staff', kpis.staff],
    ['Revenue', formatINR(kpis.revenue)],
    ['Payments', kpis.payments],
    ['Attendance', kpis.attendance],
    ['Active Memberships', kpis.activeMemberships],
    ['Expiring Memberships', kpis.expiringMemberships],
    ['Expired Memberships', kpis.expiredMemberships],
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backText}>← Back to Branches</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => loadData('refresh')}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <Text style={styles.branchName}>{branch.name}</Text>
          <Text style={styles.branchCode}>
            {branch.branchCode}
            {branch.address?.trim() ? ` · ${branch.address}` : ''}
          </Text>
          <View style={styles.statusRow}>
            <StatusBadge status={branch.status} />
          </View>
        </View>

        <View style={styles.kpiGrid}>
          {kpis &&
            kpiRows.map(([name, val]) => (
              <View key={name} style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{val}</Text>
                <Text style={styles.kpiLabel}>{name}</Text>
              </View>
            ))}
        </View>

        {/* Plans */}
        <Section title="Membership plans">
          {plans.length === 0 ? (
            <Text style={styles.emptyText}>No membership data.</Text>
          ) : (
            plans.map((p, i) => (
              <View key={p._id ?? i} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{p.name || 'No plan'}</Text>
                <Text style={styles.breakdownCount}>{p.count}</Text>
              </View>
            ))
          )}
        </Section>

        {/* Members */}
        <Section title="Members">
          {members.length === 0 ? (
            <Text style={styles.emptyText}>No members in this branch.</Text>
          ) : (
            members.map((m) => (
              <View key={m._id} style={styles.tableRow}>
                <View style={styles.tableCellMain}>
                  <Text style={styles.tableCellText} numberOfLines={1}>
                    {m.user?.name || 'Unknown'}
                  </Text>
                </View>
                <Text style={styles.tableCellSecondary}>
                  {m.currentPlan?.name || 'No plan'}
                </Text>
                <StatusBadge status={m.status} />
                <Text style={styles.tableCellDate}>
                  {m.membershipExpiryDate ? formatDate(m.membershipExpiryDate) : '-'}
                </Text>
              </View>
            ))
          )}
        </Section>

        {/* Staff */}
        <Section title="Staff">
          {staff.length === 0 ? (
            <Text style={styles.emptyText}>No staff in this branch.</Text>
          ) : (
            staff.map((s) => (
              <View key={s._id} style={styles.tableRow}>
                <View style={styles.tableCellMain}>
                  <Text style={styles.tableCellText} numberOfLines={1}>{s.name}</Text>
                </View>
                <Text style={styles.tableCellSecondary}>{s.role}</Text>
                <StatusBadge status={s.status} />
              </View>
            ))
          )}
        </Section>

        {/* Payments */}
        <Section title="Recent payments">
          {payments.length === 0 ? (
            <Text style={styles.emptyText}>No payments found.</Text>
          ) : (
            payments.map((p) => (
              <View key={p._id} style={styles.tableRow}>
                <View style={styles.tableCellMain}>
                  <Text style={styles.tableCellText}>{p.invoiceNumber || '-'}</Text>
                </View>
                <Text style={styles.tableCellSecondary}>{formatINR(p.amount)}</Text>
                <StatusBadge status={p.status} />
              </View>
            ))
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0b10',
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  backText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  errorIcon: {
    fontSize: 36,
    color: colors.textFaint,
  },
  retryButton: {
    marginTop: 18,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  headerSection: {
    marginBottom: 20,
  },
  branchName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  branchCode: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  kpiCard: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: '31%',
    minWidth: 100,
  },
  kpiValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  kpiLabel: {
    color: colors.textFaint,
    fontSize: 11,
  },
  section: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  emptyText: {
    color: colors.textFaint,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  breakdownLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  breakdownCount: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tableCellMain: {
    flex: 1,
  },
  tableCellText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  tableCellSecondary: {
    color: colors.textMuted,
    fontSize: 13,
  },
  tableCellDate: {
    color: colors.textFaint,
    fontSize: 13,
  },
});