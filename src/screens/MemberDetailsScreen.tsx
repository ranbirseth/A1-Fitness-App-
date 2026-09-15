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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import type { AppStackParamList } from '../navigation/types';
import {
  type MemberItem,
  approveMember,
  deleteMember,
  getMember,
  updateMember,
} from '../api/members';
import { type BranchItem, getBranches } from '../api/branches';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useDrawer } from '../components/drawer/DrawerContext';
import { StatusBadge } from '../components/StatusBadge';
import { MemberFormModal } from '../components/member/MemberFormModal';
import { MemberSubscriptionModal } from '../components/member/MemberSubscriptionModal';

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN');
}

function formatDate(iso?: string): string {
  if (!iso) return '-';
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

function formatDateTime(iso?: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function initials(name?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function MemberDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { memberId } = useRoute<RouteProp<AppStackParamList, 'MemberDetails'>>().params;
  const { setActive } = useDrawer();

  useEffect(() => {
    setActive('Members');
  }, [setActive]);

  const [member, setMember] = useState<MemberItem | null>(null);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [subscriptionVisible, setSubscriptionVisible] = useState(false);

  const loadData = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const [mem, br] = await Promise.all([getMember(memberId), getBranches()]);
        setMember(mem);
        setBranches(br);
      } catch (err) {
        setError(messageFrom(err, 'Unable to load member data.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [memberId]
  );

  // Reload whenever the screen regains focus (after an edit/subscription modal).
  useFocusEffect(
    useCallback(() => {
      loadData('refresh');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadData])
  );

  useEffect(() => {
    loadData('initial');
  }, [loadData]);

  const branchLabel =
    member?.branchCode &&
    (branches.find((b) => b.branchCode === member.branchCode)?.name || member.branchCode);

  const onFormSaved = useCallback(
    () => {
      Alert.alert('Member updated');
      setFormVisible(false);
      loadData('refresh');
    },
    [loadData]
  );

  const onSubscriptionDone = useCallback(
    (message: string) => {
      Alert.alert(message);
      setSubscriptionVisible(false);
      loadData('refresh');
    },
    [loadData]
  );

  const confirmApprove = useCallback(() => {
    if (!member) return;
    Alert.alert('Approve member', `Approve ${member.user?.name || 'this member'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          try {
            await approveMember(member._id);
            Alert.alert('Member approved');
            loadData('refresh');
          } catch (err) {
            Alert.alert('Error', messageFrom(err, 'Failed to approve member.'));
          }
        },
      },
    ]);
  }, [member, loadData]);

  const confirmToggleStatus = useCallback(() => {
    if (!member) return;
    const deactivating = member.status !== 'inactive';
    const title = deactivating ? 'Deactivate member' : 'Activate member';
    const message = deactivating
      ? `Deactivate ${member.user?.name || 'this member'}? This ends their sessions immediately.`
      : `Activate ${member.user?.name || 'this member'}?`;
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: deactivating ? 'Deactivate' : 'Activate',
        style: deactivating ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await updateMember(member._id, { status: deactivating ? 'inactive' : 'active' });
            Alert.alert(deactivating ? 'Member deactivated' : 'Member activated');
            loadData('refresh');
          } catch (err) {
            Alert.alert('Error', messageFrom(err, 'Failed to update member status.'));
          }
        },
      },
    ]);
  }, [member, loadData]);

  const confirmDelete = useCallback(() => {
    if (!member) return;
    Alert.alert(
      'Delete member',
      `Delete ${member.user?.name || 'this member'}? This permanently deletes the member and associated data (payments, attendance, progress). This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMember(member._id);
              Alert.alert('Member deleted', undefined, [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (err) {
              Alert.alert('Error', messageFrom(err, 'Failed to delete member.'));
            }
          },
        },
      ]
    );
  }, [member, navigation]);

  if (loading && !member) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <SuperadminHeader title="Member details" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading member…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !member) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <SuperadminHeader title="Member details" onBack={() => navigation.goBack()} />
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

  if (!member) {
    return null;
  }

  const isPending = member.status === 'pending';
  const isInactive = member.status === 'inactive';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SuperadminHeader title="Member details" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData('refresh')}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(member.user?.name)}</Text>
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.name}>{member.user?.name || 'Unknown'}</Text>
              <Text style={styles.code}>
                {member.secretCode ? `Member ID ${member.secretCode}` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            <StatusBadge status={member.status} />
            <PaymentBadge status={member.paymentStatus} />
          </View>
        </View>

        {isPending && (
          <TouchableOpacity style={styles.approveBanner} onPress={confirmApprove} activeOpacity={0.8}>
            <Text style={styles.approveBannerText}>Approve this member to activate their account</Text>
          </TouchableOpacity>
        )}

        <Section title="Personal">
          <DetailItem label="Name" value={member.user?.name || '-'} />
          <DetailItem label="Email" value={member.user?.email || 'Not provided'} />
          <DetailItem label="WhatsApp / Phone" value={member.user?.phone || '-'} />
          <DetailItem label="Member since" value={formatDate(member.membershipStartDate)} />
        </Section>

        <Section title="Branch">
          <DetailItem label="Branch" value={branchLabel || '-'} />
          <DetailItem label="Branch code" value={member.branchCode || '-'} />
        </Section>

        <Section title="Membership">
          <DetailItem label="Status" value={member.status} />
          <DetailItem label="Payment" value={member.paymentStatus} />
          <DetailItem label="Plan" value={member.currentPlan?.name || 'No plan'} />
          <DetailItem
            label="Plan price"
            value={
              member.currentPlan
                ? `${formatINR(member.currentPlan.price)} · ${member.currentPlan.duration} days`
                : '-'
            }
          />
          <DetailItem label="Start date" value={formatDate(member.membershipStartDate)} />
          <DetailItem label="Expiry date" value={formatDate(member.membershipExpiryDate)} />
          <DetailItem
            label="Remaining days"
            value={
              member.remainingDays != null ? String(member.remainingDays) : '-'
            }
          />
        </Section>

        <Section title="Trainer">
          <DetailItem label="Name" value={member.trainer?.name || 'No trainer assigned'} />
          <DetailItem label="Branch code" value={member.trainer?.branchCode || '-'} />
        </Section>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.primaryButton, isPending && styles.primaryButtonDimmed]}
            onPress={() => setSubscriptionVisible(true)}
            activeOpacity={0.8}
            disabled={isPending}
          >
            <Text style={styles.primaryButtonText}>
              {isPending ? 'Approve to manage subscription' : 'Manage Subscription'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setFormVisible(true)} activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>Edit Details</Text>
          </TouchableOpacity>
          {!isPending && (
            <TouchableOpacity style={styles.secondaryButton} onPress={confirmToggleStatus} activeOpacity={0.8}>
              <Text style={[styles.secondaryButtonText, isInactive && styles.successText]}>
                {isInactive ? 'Activate Member' : 'Deactivate Member'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.dangerButton} onPress={confirmDelete} activeOpacity={0.8}>
            <Text style={styles.dangerButtonText}>Delete Member</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <MemberFormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        editing={member}
        branches={branches}
        onSaved={onFormSaved}
      />

      <MemberSubscriptionModal
        visible={subscriptionVisible}
        onClose={() => setSubscriptionVisible(false)}
        member={member}
        onDone={onSubscriptionDone}
      />
    </SafeAreaView>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const paid = status === 'paid';
  const color = paid ? colors.success : '#f59e0b';
  return (
    <View style={[styles.paymentBadge, { borderColor: color }]}>
      <Text style={[styles.paymentBadgeText, { color }]}>
        {paid ? 'Paid' : status.toUpperCase()}
      </Text>
    </View>
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0b10',
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
    lineHeight: 20,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '800',
  },
  headerTextWrap: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  code: {
    color: colors.textFaint,
    fontSize: 13,
    marginTop: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  paymentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  approveBanner: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  approveBannerText: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingBottom: 8,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  detailLabel: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '600',
    width: 120,
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  buttonGroup: {
    marginTop: 4,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDimmed: {
    backgroundColor: 'rgba(139,92,246,0.4)',
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  successText: {
    color: colors.success,
  },
  dangerButton: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
});