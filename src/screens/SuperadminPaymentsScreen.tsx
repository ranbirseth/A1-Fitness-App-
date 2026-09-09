import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDrawer } from '../components/drawer/DrawerContext';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { StatusBadge } from '../components/StatusBadge';
import { colors } from '../theme/colors';
import {
  type PaymentItem,
  type AnalyticsOverview,
  type InvoiceData,
  getPayments,
  getAnalyticsOverview,
  getInvoice,
  markAsPaid,
  markAsUnpaid,
  sendReminders,
} from '../api/payments';
import { type Branch, getBranches } from '../api/dashboard';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatINR(value: number): string {
  return '\u20B9' + value.toLocaleString('en-IN');
}

function formatDate(iso?: string): string {
  if (!iso) return '---';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function initials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function daysUntilExpiry(expiry?: string): number | null {
  if (!expiry) return null;
  const diff = new Date(expiry).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

type PeriodKey = 'today' | 'thisMonth' | 'thisYear';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'thisYear', label: 'This Year' },
];

function getDateRange(period: PeriodKey): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  let from: string;
  switch (period) {
    case 'today':
      from = to;
      break;
    case 'thisMonth': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      from = d.toISOString().split('T')[0];
      break;
    }
    case 'thisYear': {
      const d = new Date(now.getFullYear(), 0, 1);
      from = d.toISOString().split('T')[0];
      break;
    }
  }
  return { dateFrom: from, dateTo: to };
}

type LoadingMode = 'initial' | 'refresh' | 'idle';
type ViewMode = 'payments' | 'reminders';

// ── Screen ─────────────────────────────────────────────────────────────────

export function SuperadminPaymentsScreen() {
  const { open, setActive } = useDrawer();

  useEffect(() => {
    setActive('Payments');
  }, [setActive]);

  // ── State ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('payments');
  const [loading, setLoading] = useState<LoadingMode>('initial');
  const [error, setError] = useState<string | null>(null);

  // Period + branch
  const [paymentPeriod, setPaymentPeriod] = useState<PeriodKey>('thisMonth');
  const [reminderPeriod, setReminderPeriod] = useState<PeriodKey>('thisMonth');
  const [periodPickerVisible, setPeriodPickerVisible] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [branchPickerVisible, setBranchPickerVisible] = useState(false);

  // Payments data
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  // Analytics
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);

  // Search
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Invoice modal
  const [invoiceVisible, setInvoiceVisible] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);

  // Reminder
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderResult, setReminderResult] = useState<string | null>(null);

  // Status action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const activePeriod = viewMode === 'payments' ? paymentPeriod : reminderPeriod;
  const periodLabel = PERIODS.find((p) => p.key === activePeriod)?.label ?? 'Period';
  const branchName = selectedBranch === 'ALL'
    ? 'All Branches'
    : branches.find((b) => b.branchCode === selectedBranch)?.name ?? selectedBranch;

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchData = useCallback(
    async (mode: LoadingMode) => {
      setLoading(mode);
      setError(null);
      try {
        const { dateFrom, dateTo } = getDateRange(activePeriod);
        console.log('[PAYMENT] --> selected period:', activePeriod);
        console.log('[PAYMENT] --> calculated date range:', { dateFrom, dateTo });
        console.log('[PAYMENT] --> requesting payments', { branchCode: selectedBranch, searchTerm });
        const [paymentsPage, analyticsData] = await Promise.all([
          getPayments({
            dateFrom,
            dateTo,
            branchCode: selectedBranch,
            q: searchTerm || undefined,
            page: 1,
            limit: LIMIT,
          }),
          getAnalyticsOverview({
            dateFrom,
            dateTo,
            branchCode: selectedBranch,
          }),
        ]);
        console.log('[PAYMENT] --> API response received: items=', paymentsPage.items.length, 'total=', paymentsPage.total);
        if (paymentsPage.items.length > 0) {
          console.log('[PAYMENT] --> first payment sample:', JSON.stringify(paymentsPage.items[0]).slice(0, 300));
        }
        setPayments(paymentsPage.items);
        setTotal(paymentsPage.total);
        setPage(1);
        setAnalytics(analyticsData);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load payment data.';
        console.log('[PAYMENT] --> API error:', msg);
        setError(msg);
      } finally {
        setLoading('idle');
      }
    },
    [activePeriod, selectedBranch, searchTerm]
  );

  const loadMore = useCallback(async () => {
    if (loading !== 'idle') return;
    const nextPage = page + 1;
    const skip = (nextPage - 1) * LIMIT;
    if (skip >= total) return;
    setLoading('refresh');
    try {
      const { dateFrom, dateTo } = getDateRange(activePeriod);
      const result = await getPayments({
        dateFrom,
        dateTo,
        branchCode: selectedBranch,
        q: searchTerm || undefined,
        page: nextPage,
        limit: LIMIT,
      });
      setPayments((prev) => [...prev, ...result.items]);
      setPage(nextPage);
    } catch {
      // Silently fail on load more
    } finally {
      setLoading('idle');
    }
  }, [loading, page, total, activePeriod, selectedBranch, searchTerm]);

  useEffect(() => {
    fetchData('initial');
    getBranches().then(setBranches).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData('refresh');
  }, [activePeriod, selectedBranch, searchTerm, fetchData]);

  // Debounced search
  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchTerm(text.trim());
    }, 500);
  };

  // ── Actions ────────────────────────────────────────────────────────────

  const handlePeriodChange = (key: PeriodKey) => {
    setPeriodPickerVisible(false);
    if (viewMode === 'payments') {
      setPaymentPeriod(key);
    } else {
      setReminderPeriod(key);
    }
  };

  const handleBranchChange = (code: string) => {
    setBranchPickerVisible(false);
    setSelectedBranch(code);
  };

  const handleToggleStatus = async (payment: PaymentItem) => {
    const isPaid = payment.status === 'paid';
    Alert.alert(
      isPaid ? 'Mark as Unpaid' : 'Mark as Paid',
      `Are you sure you want to mark ${payment.invoiceNumber || 'this payment'} as ${isPaid ? 'unpaid' : 'paid'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPaid ? 'Mark Unpaid' : 'Mark Paid',
          style: isPaid ? 'destructive' : 'default',
          onPress: async () => {
            setActionLoading(payment._id);
            try {
              const updated = isPaid
                ? await markAsUnpaid(payment._id)
                : await markAsPaid(payment._id);
              setPayments((prev) =>
                prev.map((p) => (p._id === payment._id ? { ...p, status: updated.status } : p))
              );
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Action failed.';
              Alert.alert('Error', msg);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleViewInvoice = async (paymentId: string) => {
    setInvoiceLoading(true);
    setInvoiceVisible(true);
    setInvoiceData(null);
    try {
      const data = await getInvoice(paymentId);
      setInvoiceData(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load invoice.';
      Alert.alert('Error', msg);
      setInvoiceVisible(false);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleSendReminders = async () => {
    Alert.alert(
      'Send Reminders',
      'Send renewal reminders to members whose plans expire soon?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setReminderLoading(true);
            setReminderResult(null);
            try {
              const branch = selectedBranch !== 'ALL' ? selectedBranch : undefined;
              const summary = await sendReminders(branch);
              let msg = `${summary.eligible} member(s) due for renewal.\n${summary.inAppSent} in-app reminder(s) sent.`;
              if (summary.whatsappStatus === 'not_configured') {
                msg += '\n\nWhatsApp provider is not configured on the server.';
              } else {
                msg += `\n${summary.whatsappReady} WhatsApp message(s) sent.\n${summary.whatsappSkipped} skipped (no WhatsApp number).`;
              }
              if (summary.duplicatesSkipped) {
                msg += `\n${summary.duplicatesSkipped} duplicate(s) skipped.`;
              }
              setReminderResult(msg);
            } catch {
              setReminderResult('Failed to send reminders. Please try again.');
            } finally {
              setReminderLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenWhatsApp = (item: PaymentItem) => {
    const phone = item.member?.user?.phone;
    if (!phone) {
      Alert.alert('No Phone', 'This member does not have a WhatsApp number on file.');
      return;
    }
    const memberName = item.member?.user?.name ?? 'there';
    const branchCode = item.member?.branchCode ?? item.branchCode ?? '---';
    const planName = item.plan?.name ?? 'your plan';
    const start = formatDate(item.membershipStartDate || item.member?.membershipStartDate);
    const expiry = formatDate(item.membershipExpiryDate || item.member?.membershipExpiryDate);
    const days = daysUntilExpiry(item.membershipExpiryDate || item.member?.membershipExpiryDate);
    const daysLabel = days === null ? 'soon' : days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`;

    const message = [
      `Hello ${memberName},`,
      '',
      `We are reaching out from A1 FITNESS (${branchCode}) about your membership.`,
      '',
      `Plan: ${planName}`,
      `Started: ${start}`,
      `Expires: ${expiry} (${daysLabel})`,
      '',
      'Your plan is due for renewal. Please renew to continue your fitness journey.',
      'Regards, A1 FITNESS',
    ].join('\n');

    const cleaned = phone.replace(/[^0-9+]/g, '');
    const url = `https://wa.me/${cleaned.startsWith('+') ? cleaned.slice(1) : cleaned}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp.');
    });
  };

  // ── Reminder eligibility ─────────────────────────────────────────────

  const reminderItems = payments.filter((p) => {
    if (p.status === 'pending') return true;
    const days = daysUntilExpiry(p.membershipExpiryDate || p.member?.membershipExpiryDate);
    return days !== null && days <= 7;
  });
  console.log('[REMINDER] --> deriving reminder candidates from', payments.length, 'payments');
  console.log('[REMINDER] --> eligible member count:', reminderItems.length);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Payments"
        subtitle={branchName}
        right={
          <View style={s.headerActions}>
            <TouchableOpacity
              style={s.headerBtn}
              onPress={() => setBranchPickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={s.headerBtnText} numberOfLines={1}>
                {branchName}
              </Text>
              <Text style={s.headerChevron}>▾</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.refreshBtn}
              onPress={() => fetchData('refresh')}
              activeOpacity={0.7}
              disabled={loading !== 'idle'}
            >
              <Text style={s.refreshBtnText}>↻</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* View mode toggle */}
      <View style={s.toggleRow}>
        <TouchableOpacity
          style={[s.toggleBtn, viewMode === 'payments' && s.toggleBtnActive]}
          onPress={() => setViewMode('payments')}
          activeOpacity={0.7}
        >
          <Text style={[s.toggleText, viewMode === 'payments' && s.toggleTextActive]}>
            Payments
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggleBtn, viewMode === 'reminders' && s.toggleBtnActive]}
          onPress={() => setViewMode('reminders')}
          activeOpacity={0.7}
        >
          <Text style={[s.toggleText, viewMode === 'reminders' && s.toggleTextActive]}>
            Reminders ({reminderItems.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Period picker */}
      <View style={s.filterRow}>
        <TouchableOpacity
          style={s.periodBtn}
          onPress={() => setPeriodPickerVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={s.periodBtnText}>{periodLabel}</Text>
          <Text style={s.periodChevron}>▾</Text>
        </TouchableOpacity>

        {viewMode === 'payments' && (
          <TextInput
            style={s.searchInput}
            placeholder="Search invoices..."
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={handleSearchChange}
          />
        )}
      </View>

      {/* Content */}
      {loading === 'initial' && !analytics ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loadingText}>Loading payments...</Text>
        </View>
      ) : error && !analytics ? (
        <View style={s.centered}>
          <Text style={s.errorIcon}>⚠</Text>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => fetchData('refresh')} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'payments' ? (
        <PaymentList
          payments={payments}
          total={total}
          loading={loading}
          analytics={analytics}
          actionLoading={actionLoading}
          onToggleStatus={handleToggleStatus}
          onViewInvoice={handleViewInvoice}
          onLoadMore={loadMore}
          onRefresh={() => fetchData('refresh')}
        />
      ) : (
        <ReminderList
          items={reminderItems}
          reminderLoading={reminderLoading}
          reminderResult={reminderResult}
          onSendReminders={handleSendReminders}
          onOpenWhatsApp={handleOpenWhatsApp}
          onRefresh={() => fetchData('refresh')}
          refreshing={loading === 'refresh'}
        />
      )}

      {/* Period picker modal */}
      <Modal
        visible={periodPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPeriodPickerVisible(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setPeriodPickerVisible(false)}
        >
          <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTitle}>Select Period</Text>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[s.modalOption, activePeriod === p.key && s.modalOptionActive]}
                onPress={() => handlePeriodChange(p.key)}
                activeOpacity={0.7}
              >
                <Text style={[s.modalOptionText, activePeriod === p.key && s.modalOptionTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Branch picker modal */}
      <Modal
        visible={branchPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBranchPickerVisible(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setBranchPickerVisible(false)}
        >
          <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTitle}>Select Branch</Text>
            <TouchableOpacity
              style={[s.modalOption, selectedBranch === 'ALL' && s.modalOptionActive]}
              onPress={() => handleBranchChange('ALL')}
              activeOpacity={0.7}
            >
              <Text style={[s.modalOptionText, selectedBranch === 'ALL' && s.modalOptionTextActive]}>
                All Branches
              </Text>
            </TouchableOpacity>
            {branches.map((b) => (
              <TouchableOpacity
                key={b._id}
                style={[s.modalOption, selectedBranch === b.branchCode && s.modalOptionActive]}
                onPress={() => handleBranchChange(b.branchCode)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    s.modalOptionText,
                    selectedBranch === b.branchCode && s.modalOptionTextActive,
                  ]}
                >
                  {b.name}
                </Text>
                <Text
                  style={[
                    s.modalOptionCode,
                    selectedBranch === b.branchCode && s.modalOptionTextActive,
                  ]}
                >
                  {b.branchCode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invoice modal */}
      <Modal
        visible={invoiceVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInvoiceVisible(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setInvoiceVisible(false)}
        >
          <View style={s.invoiceSheet} onStartShouldSetResponder={() => true}>
            {invoiceLoading ? (
              <View style={s.invoiceLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={s.loadingText}>Loading invoice...</Text>
              </View>
            ) : invoiceData ? (
              <InvoiceContent data={invoiceData} />
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── Payment List ───────────────────────────────────────────────────────────

function PaymentList({
  payments,
  total,
  loading,
  analytics,
  actionLoading,
  onToggleStatus,
  onViewInvoice,
  onLoadMore,
  onRefresh,
}: {
  payments: PaymentItem[];
  total: number;
  loading: LoadingMode;
  analytics: AnalyticsOverview | null;
  actionLoading: string | null;
  onToggleStatus: (p: PaymentItem) => void;
  onViewInvoice: (id: string) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  const kpis = analytics?.kpis;
  const paymentsByStatus = analytics?.breakdowns?.paymentsByStatus ?? [];
  const paidCount = paymentsByStatus.find((b) => b._id === 'paid')?.count ?? 0;
  const pendingCount = paymentsByStatus.find((b) => b._id === 'pending')?.count ?? 0;
  const hasMore = payments.length < total;

  return (
    <FlatList
      data={payments}
      keyExtractor={(item) => item._id}
      contentContainerStyle={s.listContent}
      refreshControl={
        <RefreshControl
          refreshing={loading === 'refresh'}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
      ListHeaderComponent={
        <>
          {/* KPI cards */}
          <View style={s.kpiRow}>
            <KpiCard label="Total" value={formatINR(kpis?.totalRevenue ?? 0)} color={colors.accent} />
            <KpiCard label="Paid" value={String(paidCount)} color={colors.success} />
          </View>
          <View style={s.kpiRow}>
            <KpiCard label="Pending" value={String(pendingCount)} color="#f59e0b" />
            <KpiCard label="Expiring" value={String(kpis?.expiringCount ?? 0)} color={colors.primary} />
          </View>

          <Text style={s.listTitle}>Payment Records ({total})</Text>
        </>
      }
      ListEmptyComponent={
        <View style={s.emptyContainer}>
          <Text style={s.emptyIcon}>₹</Text>
          <Text style={s.emptyText}>No payments found for this period.</Text>
        </View>
      }
      ListFooterComponent={
        hasMore ? (
          <TouchableOpacity style={s.loadMoreBtn} onPress={onLoadMore} activeOpacity={0.7}>
            {loading === 'refresh' ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={s.loadMoreText}>Load More</Text>
            )}
          </TouchableOpacity>
        ) : payments.length > 0 ? (
          <Text style={s.endText}>End of list</Text>
        ) : null
      }
      renderItem={({ item }) => (
        <PaymentCard
          payment={item}
          actionLoading={actionLoading === item._id}
          onToggleStatus={() => onToggleStatus(item)}
          onViewInvoice={() => onViewInvoice(item._id)}
        />
      )}
    />
  );
}

// ── Payment Card ───────────────────────────────────────────────────────────

function PaymentCard({
  payment,
  actionLoading,
  onToggleStatus,
  onViewInvoice,
}: {
  payment: PaymentItem;
  actionLoading: boolean;
  onToggleStatus: () => void;
  onViewInvoice: () => void;
}) {
  const memberName = payment.member?.user?.name ?? 'Unknown';
  const planName = payment.plan?.name ?? 'Manual';
  const branchCode = payment.member?.branchCode ?? payment.branchCode ?? '---';
  const isPaid = payment.status === 'paid';

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.cardAvatar}>
          <Text style={s.cardAvatarText}>{initials(memberName)}</Text>
        </View>
        <View style={s.cardHeaderInfo}>
          <Text style={s.cardName} numberOfLines={1}>{memberName}</Text>
          <Text style={s.cardInvoice}>{payment.invoiceNumber || '---'}</Text>
        </View>
        <StatusBadge status={payment.status} />
      </View>

      <View style={s.cardBody}>
        <InfoRow label="Plan" value={planName} />
        <InfoRow label="Amount" value={formatINR(payment.amount)} valueColor={colors.accent} />
        <InfoRow label="Payment Date" value={formatDate(payment.date || payment.createdAt)} />
        <InfoRow label="Branch" value={branchCode} />
        <InfoRow label="Method" value={(payment.method || 'cash').toUpperCase()} />
        <InfoRow label="Start" value={formatDate(payment.membershipStartDate || payment.member?.membershipStartDate)} />
        <InfoRow label="Expiry" value={formatDate(payment.membershipExpiryDate || payment.member?.membershipExpiryDate)} />
        {payment.operationType ? (
          <InfoRow label="Type" value={payment.operationType.toUpperCase()} />
        ) : null}
      </View>

      <View style={s.cardActions}>
        <TouchableOpacity
          style={[s.actionBtn, isPaid ? s.actionBtnDanger : s.actionBtnSuccess]}
          onPress={onToggleStatus}
          disabled={actionLoading}
          activeOpacity={0.7}
        >
          {actionLoading ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Text style={s.actionBtnText}>{isPaid ? 'Mark Unpaid' : 'Mark Paid'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={s.actionBtnSecondary} onPress={onViewInvoice} activeOpacity={0.7}>
          <Text style={s.actionBtnSecondaryText}>Invoice</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Reminder List ──────────────────────────────────────────────────────────

function ReminderList({
  items,
  reminderLoading,
  reminderResult,
  onSendReminders,
  onOpenWhatsApp,
  onRefresh,
  refreshing,
}: {
  items: PaymentItem[];
  reminderLoading: boolean;
  reminderResult: string | null;
  onSendReminders: () => void;
  onOpenWhatsApp: (item: PaymentItem) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item._id}
      contentContainerStyle={s.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
      ListHeaderComponent={
        <>
          {/* Send reminders button */}
          <TouchableOpacity
            style={s.sendReminderBtn}
            onPress={onSendReminders}
            disabled={reminderLoading}
            activeOpacity={0.7}
          >
            {reminderLoading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={s.sendReminderBtnText}>Send Reminders</Text>
            )}
          </TouchableOpacity>

          {reminderResult ? (
            <View style={s.reminderResult}>
              <Text style={s.reminderResultText}>{reminderResult}</Text>
            </View>
          ) : null}

          <Text style={s.listTitle}>Eligible Members ({items.length})</Text>
          <Text style={s.listSubtitle}>Pending payments or plans expiring within 7 days</Text>
        </>
      }
      ListEmptyComponent={
        <View style={s.emptyContainer}>
          <Text style={s.emptyIcon}>✓</Text>
          <Text style={s.emptyText}>No members need reminders right now.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const memberName = item.member?.user?.name ?? 'Unknown';
        const phone = item.member?.user?.phone;
        const branchCode = item.member?.branchCode ?? item.branchCode ?? '---';
        const planName = item.plan?.name ?? '---';
        const days = daysUntilExpiry(item.membershipExpiryDate || item.member?.membershipExpiryDate);

        return (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardAvatar}>
                <Text style={s.cardAvatarText}>{initials(memberName)}</Text>
              </View>
              <View style={s.cardHeaderInfo}>
                <Text style={s.cardName} numberOfLines={1}>{memberName}</Text>
                <Text style={s.cardPhone}>{phone || 'No phone'}</Text>
              </View>
              {days !== null && (
                <View
                  style={[
                    s.daysBadge,
                    { borderColor: days <= 0 ? colors.danger : days <= 3 ? '#f59e0b' : colors.accent },
                  ]}
                >
                  <Text
                    style={[
                      s.daysBadgeText,
                      { color: days <= 0 ? colors.danger : days <= 3 ? '#f59e0b' : colors.accent },
                    ]}
                  >
                    {days <= 0 ? 'Expired' : `${days}d left`}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.cardBody}>
              <InfoRow label="Branch" value={branchCode} />
              <InfoRow label="Plan" value={planName} />
              <InfoRow label="Start" value={formatDate(item.membershipStartDate || item.member?.membershipStartDate)} />
              <InfoRow label="Expiry" value={formatDate(item.membershipExpiryDate || item.member?.membershipExpiryDate)} />
              <InfoRow label="Status" value={item.status === 'pending' ? 'Pending Payment' : 'Active'} />
            </View>

            <View style={s.cardActions}>
              <TouchableOpacity
                style={s.whatsappBtn}
                onPress={() => onOpenWhatsApp(item)}
                activeOpacity={0.7}
              >
                <Text style={s.whatsappBtnText}>Send Reminder</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
    />
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={kpiStyles.card}>
      <Text style={kpiStyles.label}>{label}</Text>
      <Text style={[kpiStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 4,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
  },
});

// ── Info Row ───────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ── Invoice Content ────────────────────────────────────────────────────────

function InvoiceContent({ data }: { data: InvoiceData }) {
  return (
    <View style={s.invoiceContent}>
      <View style={s.invoiceHeader}>
        <Text style={s.invoiceBrand}>{data.business.displayName}</Text>
        <Text style={s.invoiceTagline}>{data.business.tagline}</Text>
        <Text style={s.invoiceTitle}>INVOICE</Text>
        <Text style={s.invoiceNumber}>#{data.invoiceNumber}</Text>
      </View>

      <View style={s.invoiceSection}>
        <Text style={s.invoiceSectionTitle}>BILLED TO</Text>
        <Text style={s.invoiceText}>{data.member.name}</Text>
        {data.member.memberId ? (
          <Text style={s.invoiceTextMuted}>ID: {data.member.memberId}</Text>
        ) : null}
        {data.member.email ? <Text style={s.invoiceTextMuted}>{data.member.email}</Text> : null}
        {data.member.phone ? <Text style={s.invoiceTextMuted}>{data.member.phone}</Text> : null}
      </View>

      <View style={s.invoiceSection}>
        <Text style={s.invoiceSectionTitle}>DETAILS</Text>
        <InfoRow label="Date" value={formatDate(data.date)} />
        <InfoRow label="Status" value={data.status.toUpperCase()} />
        <InfoRow label="Method" value={(data.method || 'cash').toUpperCase()} />
        {data.billingPeriod?.start ? (
          <InfoRow
            label="Billing"
            value={`${formatDate(data.billingPeriod.start)} - ${formatDate(data.billingPeriod.end)}`}
          />
        ) : null}
      </View>

      <View style={s.invoiceSection}>
        <Text style={s.invoiceSectionTitle}>ITEMS</Text>
        {data.lineItems.map((item, idx) => (
          <View key={idx} style={s.invoiceItem}>
            <View style={s.invoiceItemLeft}>
              <Text style={s.invoiceItemDesc}>{item.description}</Text>
              {item.details ? (
                <Text style={s.invoiceItemDetails}>{item.details}</Text>
              ) : null}
            </View>
            <Text style={s.invoiceItemAmount}>{formatINR(item.amount)}</Text>
          </View>
        ))}
      </View>

      <View style={s.invoiceDivider} />
      <InfoRow label="Total" value={formatINR(data.total)} valueColor={colors.accent} />

      {data.note ? (
        <Text style={s.invoiceNote}>Note: {data.note}</Text>
      ) : null}

      <Text style={s.invoiceFooter}>Thank you for your business!</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0b10' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,32,44,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 140,
  },
  headerBtnText: { color: colors.text, fontSize: 11, fontWeight: '600', marginRight: 4, flexShrink: 1 },
  headerChevron: { color: colors.textMuted, fontSize: 11 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(30,32,44,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 8 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderColor: 'rgba(139,92,246,0.5)',
  },
  toggleText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: colors.accent, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  periodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,32,44,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  periodBtnText: { color: colors.text, fontSize: 13, fontWeight: '600', marginRight: 6 },
  periodChevron: { color: colors.textMuted, fontSize: 12 },
  searchInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 13,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  loadingText: { color: colors.textMuted, fontSize: 15, marginTop: 12 },
  errorIcon: { fontSize: 40, marginBottom: 12, color: colors.textFaint },
  errorText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  kpiRow: { flexDirection: 'row', marginBottom: 8 },
  listTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 12, marginBottom: 4 },
  listSubtitle: { color: colors.textFaint, fontSize: 12, marginBottom: 12 },
  card: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(139,92,246,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardAvatarText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  cardHeaderInfo: { flex: 1, marginRight: 8 },
  cardName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  cardInvoice: { color: colors.textFaint, fontSize: 12, fontFamily: 'monospace', marginTop: 2 },
  cardPhone: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  cardBody: { marginBottom: 12 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  infoLabel: { color: colors.textFaint, fontSize: 12 },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 8 },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnSuccess: { backgroundColor: colors.success },
  actionBtnDanger: { backgroundColor: 'rgba(229,72,77,0.2)', borderWidth: 1, borderColor: colors.danger },
  actionBtnText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  actionBtnSecondary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  actionBtnSecondaryText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  sendReminderBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  sendReminderBtnText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  reminderResult: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  reminderResultText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  daysBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  daysBadgeText: { fontSize: 11, fontWeight: '700' },
  whatsappBtn: {
    flex: 1,
    backgroundColor: '#25D366',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  whatsappBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12, color: colors.textFaint },
  emptyText: { color: colors.textFaint, fontSize: 14, textAlign: 'center' },
  loadMoreBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 8,
  },
  loadMoreText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  endText: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#151A20',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 32,
    paddingHorizontal: 20,
    maxHeight: '60%',
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 4,
  },
  modalOptionActive: { backgroundColor: 'rgba(139,92,246,0.15)' },
  modalOptionText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  modalOptionTextActive: { color: colors.accent, fontWeight: '700' },
  modalOptionCode: { color: colors.textFaint, fontSize: 13 },
  invoiceSheet: {
    backgroundColor: '#151A20',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 32,
    paddingHorizontal: 20,
    maxHeight: '85%',
  },
  invoiceLoading: { alignItems: 'center', paddingVertical: 40 },
  invoiceContent: { paddingTop: 8 },
  invoiceHeader: { alignItems: 'center', marginBottom: 20 },
  invoiceBrand: { color: colors.primary, fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  invoiceTagline: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  invoiceTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 12 },
  invoiceNumber: { color: colors.textFaint, fontSize: 13, fontFamily: 'monospace', marginTop: 4 },
  invoiceSection: { marginBottom: 16 },
  invoiceSectionTitle: { color: colors.accent, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  invoiceText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  invoiceTextMuted: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  invoiceDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 12 },
  invoiceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  invoiceItemLeft: { flex: 1, marginRight: 12 },
  invoiceItemDesc: { color: colors.text, fontSize: 14, fontWeight: '600' },
  invoiceItemDetails: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  invoiceItemAmount: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  invoiceNote: { color: colors.textFaint, fontSize: 12, marginTop: 12, fontStyle: 'italic' },
  invoiceFooter: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 20 },
});
