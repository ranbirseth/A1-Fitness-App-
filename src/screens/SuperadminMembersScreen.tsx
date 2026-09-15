import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import {
  type MemberItem,
  approveMember,
  deleteMember,
  getMembers,
  updateMember,
} from '../api/members';
import { type BranchItem, getBranches } from '../api/branches';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useDrawer } from '../components/drawer/DrawerContext';
import { StatusBadge } from '../components/StatusBadge';
import { MemberFormModal } from '../components/member/MemberFormModal';
import { MemberSubscriptionModal } from '../components/member/MemberSubscriptionModal';
import type { AppStackParamList } from '../navigation/types';

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

function initials(name?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending Approval' },
  { value: 'expired', label: 'Expired' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'inactive', label: 'Inactive' },
];

const SEARCH_DEBOUNCE_MS = 500;

export function SuperadminMembersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { setActive } = useDrawer();

  useEffect(() => {
    setActive('Members');
  }, [setActive]);

  const [members, setMembers] = useState<MemberItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('ALL');

  const [filterSheet, setFilterSheet] = useState<'status' | 'branch' | null>(null);
  const [formMember, setFormMember] = useState<MemberItem | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [subscriptionMember, setSubscriptionMember] = useState<MemberItem | null>(null);
  const [subscriptionVisible, setSubscriptionVisible] = useState(false);

  // Debounced search (500ms mirrors the web app).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const [br, page] = await Promise.all([
          getBranches(),
          getMembers({
            search: searchTerm || undefined,
            status: statusFilter === 'all' ? undefined : statusFilter,
            branchCode: branchFilter === 'ALL' ? undefined : branchFilter,
            limit: 100,
          }),
        ]);
        setBranches(br);
        setMembers(page.items);
      } catch (err) {
        setError(messageFrom(err, 'Failed to load members. Please try again.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchTerm, statusFilter, branchFilter]
  );

  useEffect(() => {
    load('initial');
  }, [load]);

  const findBranchLabel = useCallback(
    (code: string): string => {
      const b = branches.find((br) => br.branchCode === code);
      return b ? b.name : code;
    },
    [branches]
  );

  const activeFilterCount = (searchTerm ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (branchFilter !== 'ALL' ? 1 : 0);

  const openCreate = useCallback(() => {
    setFormMember(null);
    setFormVisible(true);
  }, []);

  const openEdit = useCallback((member: MemberItem) => {
    setFormMember(member);
    setFormVisible(true);
  }, []);

  const onFormSaved = useCallback(
    (message: string) => {
      Alert.alert(message);
      load('refresh');
    },
    [load]
  );

  const openDetails = useCallback(
    (member: MemberItem) => {
      navigation.navigate('MemberDetails', { memberId: member._id });
    },
    [navigation]
  );

  const openSubscription = useCallback((member: MemberItem) => {
    setSubscriptionMember(member);
    setSubscriptionVisible(true);
  }, []);

  const onSubscriptionDone = useCallback(
    (message: string) => {
      Alert.alert(message);
      load('refresh');
    },
    [load]
  );

  const confirmApprove = useCallback(
    (member: MemberItem) => {
      Alert.alert('Approve member', `Approve ${member.user?.name || 'this member'}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              await approveMember(member._id);
              Alert.alert('Member approved');
              load('refresh');
            } catch (err) {
              Alert.alert('Error', messageFrom(err, 'Failed to approve member.'));
            }
          },
        },
      ]);
    },
    [load]
  );

  const confirmToggleStatus = useCallback(
    (member: MemberItem) => {
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
              load('refresh');
            } catch (err) {
              Alert.alert('Error', messageFrom(err, 'Failed to update member status.'));
            }
          },
        },
      ]);
    },
    [load]
  );

  const confirmDelete = useCallback(
    (member: MemberItem) => {
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
                Alert.alert('Member deleted');
                load('refresh');
              } catch (err) {
                Alert.alert('Error', messageFrom(err, 'Failed to delete member.'));
              }
            },
          },
        ]
      );
    },
    [load]
  );

  const filteredHasQuery = searchTerm.length > 0 || statusFilter !== 'all' || branchFilter !== 'ALL';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Members"
        subtitle="Manage memberships across all branches."
        right={
          <TouchableOpacity style={styles.addButton} onPress={openCreate} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>+ Add Member</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, email or phone…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label={statusFilter === 'all' ? 'All Statuses' : statusLabel(statusFilter)}
          onPress={() => setFilterSheet('status')}
        />
        <FilterChip
          label={branchFilter === 'ALL' ? 'All Branches' : findBranchLabel(branchFilter)}
          onPress={() => setFilterSheet('branch')}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading members…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => load('initial')}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load('refresh')}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {members.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {filteredHasQuery ? 'No members match your search or filters.' : 'No members found'}
              </Text>
              {filteredHasQuery && (
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={() => {
                    setSearchQuery('');
                    setSearchTerm('');
                    setStatusFilter('all');
                    setBranchFilter('ALL');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.resetButtonText}>Reset filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            members.map((member) => (
              <MemberCard
                key={member._id}
                member={member}
                branchLabel={findBranchLabel(member.branchCode)}
                onDetails={() => openDetails(member)}
                onSubscription={() => openSubscription(member)}
                onApprove={() => confirmApprove(member)}
                onEdit={() => openEdit(member)}
                onToggleStatus={() => confirmToggleStatus(member)}
                onDelete={() => confirmDelete(member)}
              />
            ))
          )}
        </ScrollView>
      )}

      <ChoiceSheet
        visible={filterSheet === 'status'}
        title="Filter by status"
        options={STATUS_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
          selected: statusFilter === o.value,
        }))}
        onClose={() => setFilterSheet(null)}
        onSelect={(value) => {
          setStatusFilter(value);
          setFilterSheet(null);
        }}
      />

      <ChoiceSheet
        visible={filterSheet === 'branch'}
        title="Filter by branch"
        options={[
          { value: 'ALL', label: 'All Branches', selected: branchFilter === 'ALL' },
          ...branches.map((b) => ({
            value: b.branchCode,
            label: `${b.name} (${b.branchCode})`,
            selected: branchFilter === b.branchCode,
          })),
        ]}
        onClose={() => setFilterSheet(null)}
        onSelect={(value) => {
          setBranchFilter(value);
          setFilterSheet(null);
        }}
      />

      <MemberFormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        editing={formMember}
        branches={branches}
        onSaved={onFormSaved}
      />

      <MemberSubscriptionModal
        visible={subscriptionVisible}
        onClose={() => setSubscriptionVisible(false)}
        member={subscriptionMember}
        onDone={onSubscriptionDone}
      />
    </SafeAreaView>
  );
}

function statusLabel(value: string): string {
  const found = STATUS_OPTIONS.find((o) => o.value === value);
  return found ? found.label : value;
}

function FilterChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.filterChip} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.filterChipText} numberOfLines={1}>
        {label} ▾
      </Text>
    </TouchableOpacity>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const paid = status === 'paid';
  const color = paid ? colors.success : '#f59e0b';
  return (
    <View style={[styles.paymentBadge, { borderColor: color }]}>
      <Text style={[styles.paymentBadgeText, { color }]}>
        {status === 'paid' ? 'Paid' : status.toUpperCase()}
      </Text>
    </View>
  );
}

function MemberCard({
  member,
  branchLabel,
  onDetails,
  onSubscription,
  onApprove,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  member: MemberItem;
  branchLabel: string;
  onDetails: () => void;
  onSubscription: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const name = member.user?.name || 'Unknown';
  const isPending = member.status === 'pending';
  const isInactive = member.status === 'inactive';

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {member.secretCode ? `Member ID ${member.secretCode}` : ''}
          </Text>
        </View>
        <View style={styles.badgeCol}>
          <StatusBadge status={member.status} />
          <View style={styles.paymentBadgeWrap}>
            <PaymentBadge status={member.paymentStatus} />
          </View>
        </View>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Branch</Text>
        <Text style={styles.detailValue}>
          {branchLabel} ({member.branchCode})
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Plan</Text>
        <Text style={styles.detailValue}>
          {member.currentPlan
            ? `${member.currentPlan.name} · ${formatINR(member.currentPlan.price)} · ${member.currentPlan.duration}d`
            : 'No plan'}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Trainer</Text>
        <Text style={styles.detailValue}>{member.trainer?.name || 'No trainer'}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Start</Text>
        <Text style={styles.detailValue}>{formatDate(member.membershipStartDate)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Expiry</Text>
        <Text style={styles.detailValue}>{formatDate(member.membershipExpiryDate)}</Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionButton} onPress={onDetails} activeOpacity={0.7}>
          <Text style={styles.actionText}>Details</Text>
        </TouchableOpacity>
        {isPending ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary]}
            onPress={onApprove}
            activeOpacity={0.7}
          >
            <Text style={styles.actionTextPrimary}>Approve</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary]}
            onPress={onSubscription}
            activeOpacity={0.7}
          >
            <Text style={styles.actionTextPrimary}>Subscription</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionButton} onPress={onEdit} activeOpacity={0.7}>
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onToggleStatus} activeOpacity={0.7}>
          <Text style={[styles.actionText, isInactive && styles.actionTextSuccess]}>
            {isInactive ? 'Activate' : 'Deactivate'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onDelete} activeOpacity={0.7}>
          <Text style={styles.actionDangerText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ChoiceSheet({
  visible,
  title,
  options,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: Array<{ value: string; label: string; selected?: boolean }>;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.sheetOption, opt.selected && styles.sheetOptionSelected]}
                onPress={() => onSelect(opt.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.sheetOptionText, opt.selected && styles.sheetOptionTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0b10',
  },
  addButton: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addButtonText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  searchWrap: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  filterChip: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexShrink: 1,
  },
  filterChipText: {
    color: colors.textMuted,
    fontSize: 13,
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyBox: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: colors.textFaint,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  resetButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  resetButtonText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  cardTitleWrap: {
    flex: 1,
    marginRight: 8,
  },
  cardName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardMeta: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 2,
  },
  badgeCol: {
    alignItems: 'flex-end',
  },
  paymentBadgeWrap: {
    marginTop: 4,
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
  detailRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  detailLabel: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '600',
    width: 60,
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  actionButtonPrimary: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(139,92,246,0.18)',
  },
  actionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  actionTextPrimary: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  actionDangerText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  actionTextSuccess: {
    color: colors.success,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetBody: {
    backgroundColor: '#13161d',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '60%',
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  sheetOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  sheetOptionSelected: {
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  sheetOptionText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  sheetOptionTextSelected: {
    color: colors.accent,
    fontWeight: '700',
  },
});