import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { colors } from '../theme/colors';
import { getAttendance, type AttendanceItem } from '../api/attendance';
import { getBranches, type BranchItem } from '../api/branches';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useDrawer } from '../components/drawer/DrawerContext';

const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 500;
const DATE_SHEET_DAYS = 30;

type LoadingMode = 'initial' | 'refresh' | 'loadMore' | 'idle';

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function toDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatChipDate(d: Date): string {
  return toDateParam(d) === toDateParam(new Date())
    ? 'Today'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatHeaderDate(d: Date): string {
  const isToday = toDateParam(d) === toDateParam(new Date());
  const base = d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return isToday ? `Today · ${base}` : base;
}

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(checkIn?: string | null, checkOut?: string | null): string | null {
  if (!checkIn || !checkOut) return null;
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (isNaN(a) || isNaN(b) || b <= a) return null;
  const mins = Math.round((b - a) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function initials(name?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function memberName(item: AttendanceItem): string {
  return item.member?.user?.name ?? 'Unknown member';
}

function memberPhone(item: AttendanceItem): string | null {
  return item.member?.user?.phone ?? null;
}

function memberBranch(item: AttendanceItem): string {
  return item.member?.branchCode ?? item.branchCode ?? '---';
}

function dateOptions(days: number): Array<{ value: string; label: string; sub: string }> {
  const out: Array<{ value: string; label: string; sub: string }> = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const label =
      i === 0
        ? 'Today'
        : i === 1
          ? 'Yesterday'
          : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const sub = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    out.push({ value: toDateParam(d), label, sub });
  }
  return out;
}

const STATUS_COLORS: Record<string, string> = {
  present: colors.success,
  completed: '#2ecc71',
  late: '#f59e0b',
  'half-day': '#a855f7',
  absent: colors.danger,
};

function AttendanceStatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status.toLowerCase()] ?? colors.textMuted;
  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color }]}>{status}</Text>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export function SuperadminAttendanceScreen() {
  const { setActive } = useDrawer();

  useEffect(() => {
    setActive('Attendance');
  }, [setActive]);

  const [mode, setMode] = useState<LoadingMode>('initial');
  const [error, setError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  const reqIdRef = useRef(0);

  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [dateFilter, setDateFilter] = useState(() => toDateParam(new Date()));
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [dateSheetVisible, setDateSheetVisible] = useState(false);
  const [branchSheetVisible, setBranchSheetVisible] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedDate = useMemo(() => new Date(dateFilter + 'T12:00:00'), [dateFilter]);
  const branchName =
    branchFilter === 'ALL'
      ? 'All Branches'
      : branches.find((b) => b.branchCode === branchFilter)?.name ?? branchFilter;

  useEffect(() => {
    getBranches().then(setBranches).catch(() => {});
  }, []);

  // Debounced search (500ms).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const fetchData = useCallback(
    async (kind: LoadingMode, pageOverride?: number) => {
      const reqId = ++reqIdRef.current;
      const targetPage = pageOverride ?? 1;
      setMode(kind);
      setError(null);
      try {
        const res = await getAttendance({
          date: dateFilter,
          search: searchTerm || undefined,
          branchCode: branchFilter === 'ALL' ? undefined : branchFilter,
          page: targetPage,
          limit: LIMIT,
        });
        if (reqIdRef.current !== reqId) return;
        if (kind === 'loadMore') {
          pageRef.current = res.page;
          setPage(res.page);
          setAttendance((prev) => [...prev, ...res.items]);
        } else {
          pageRef.current = res.page;
          setPage(res.page);
          setAttendance(res.items);
        }
        setTotal(res.total);
      } catch (e: unknown) {
        if (reqIdRef.current !== reqId) return;
        if (kind !== 'loadMore') {
          setError(messageFrom(e, 'Unable to load attendance'));
        }
      } finally {
        if (reqIdRef.current === reqId) setMode('idle');
      }
    },
    [dateFilter, searchTerm, branchFilter]
  );

  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      fetchData('initial');
    } else {
      fetchData('refresh');
    }
  }, [fetchData]);

  const loadMore = useCallback(async () => {
    if (mode !== 'idle' || attendance.length === 0) return;
    if (attendance.length >= total) return;
    fetchData('loadMore', pageRef.current + 1);
  }, [mode, attendance.length, total, fetchData]);

  const onRefresh = useCallback(() => {
    fetchData('refresh');
  }, [fetchData]);

  const kpis = useMemo(() => {
    let present = 0;
    let late = 0;
    let completed = 0;
    for (const a of attendance) {
      if (a.status === 'present') present += 1;
      else if (a.status === 'late') late += 1;
      else if (a.status === 'completed') completed += 1;
    }
    return { total: attendance.length, present, late, completed };
  }, [attendance]);

  const todayParam = toDateParam(new Date());
  const hasActiveFilters =
    searchTerm.length > 0 || branchFilter !== 'ALL' || dateFilter !== todayParam;

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSearchTerm('');
    setBranchFilter('ALL');
    setDateFilter(todayParam);
  }, [todayParam]);

  const hasMore = attendance.length < total;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Attendance"
        subtitle={formatHeaderDate(selectedDate)}
        right={
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={onRefresh}
            activeOpacity={0.7}
            disabled={mode !== 'idle'}
          >
            <Text style={styles.refreshBtnText}>↻</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search member..."
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.filterRow}>
        <FilterChip label={formatChipDate(selectedDate)} onPress={() => setDateSheetVisible(true)} />
        <FilterChip label={branchName} onPress={() => setBranchSheetVisible(true)} />
      </View>

      {mode === 'initial' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading attendance…</Text>
        </View>
      ) : error && attendance.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={attendance}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={mode === 'refresh'}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <>
              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{error}</Text>
                  <TouchableOpacity onPress={onRefresh} activeOpacity={0.8} hitSlop={8}>
                    <Text style={styles.errorBannerRetry}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.kpiRow}>
                <KpiCard label="Total" value={String(kpis.total)} color={colors.accent} />
                <KpiCard label="Present" value={String(kpis.present)} color={colors.success} />
              </View>
              <View style={styles.kpiRow}>
                <KpiCard label="Late" value={String(kpis.late)} color="#f59e0b" />
                <KpiCard label="Completed" value={String(kpis.completed)} color={colors.primary} />
              </View>
              <Text style={styles.kpiNote}>
                Counts from the {attendance.length} of {total} records shown.
              </Text>

              <Text style={styles.listTitle}>Attendance Records ({total})</Text>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>◎</Text>
              <Text style={styles.emptyTitle}>No attendance found</Text>
              <Text style={styles.emptySubtitle}>
                {hasActiveFilters
                  ? 'Try another date, branch, or search.'
                  : 'There are no attendance records for this date.'}
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity style={styles.resetButton} onPress={resetFilters} activeOpacity={0.8}>
                  <Text style={styles.resetButtonText}>Reset filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore} activeOpacity={0.7}>
                {mode === 'loadMore' ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.loadMoreText}>Load More</Text>
                )}
              </TouchableOpacity>
            ) : attendance.length > 0 ? (
              <Text style={styles.endText}>End of list</Text>
            ) : null
          }
          renderItem={({ item }) => <AttendanceCard item={item} />}
        />
      )}

      <DateSheet
        visible={dateSheetVisible}
        options={dateOptions(DATE_SHEET_DAYS)}
        selectedValue={dateFilter}
        onClose={() => setDateSheetVisible(false)}
        onSelect={(value) => {
          setDateSheetVisible(false);
          setDateFilter(value);
        }}
      />

      <BranchSheet
        visible={branchSheetVisible}
        branches={branches}
        selectedValue={branchFilter}
        onClose={() => setBranchSheetVisible(false)}
        onSelect={(value) => {
          setBranchSheetVisible(false);
          setBranchFilter(value);
        }}
      />
    </SafeAreaView>
  );
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

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
    </View>
  );
}

const AttendanceCard = React.memo(function AttendanceCard({ item }: { item: AttendanceItem }) {
  const name = memberName(item);
  const phone = memberPhone(item);
  const branch = memberBranch(item);
  const duration = formatDuration(item.checkIn, item.checkOut);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {phone || 'No phone on file'}
          </Text>
        </View>
        <AttendanceStatusBadge status={item.status} />
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Branch</Text>
        <Text style={styles.detailValue}>{branch}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Check-in</Text>
        <Text style={styles.detailValue}>{formatTime(item.checkIn)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Check-out</Text>
        <Text style={styles.detailValue}>{formatTime(item.checkOut)}</Text>
      </View>
      {duration ? (
        <View style={[styles.detailRow, styles.detailRowLast]}>
          <Text style={styles.detailLabel}>Duration</Text>
          <Text style={[styles.detailValue, styles.durationValue]}>{duration}</Text>
        </View>
      ) : null}
    </View>
  );
});

// ── Bottom sheets ──────────────────────────────────────────────────────────

function DateSheet({
  visible,
  options,
  selectedValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  options: Array<{ value: string; label: string; sub: string }>;
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>Select Date</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((opt) => {
              const selected = opt.value === selectedValue;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.sheetOption, selected && styles.sheetOptionSelected]}
                  onPress={() => onSelect(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sheetOptionText, selected && styles.sheetOptionTextSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.sheetOptionSub, selected && styles.sheetOptionTextSelected]}>
                    {opt.sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BranchSheet({
  visible,
  branches,
  selectedValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  branches: BranchItem[];
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>Select Branch</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {[
              { value: 'ALL', label: 'All Branches', sub: 'Show attendance across all branches' },
              ...branches.map((b) => ({
                value: b.branchCode,
                label: b.name,
                sub: b.branchCode,
              })),
            ].map((opt) => {
              const selected = opt.value === selectedValue;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.sheetOption, selected && styles.sheetOptionSelected]}
                  onPress={() => onSelect(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sheetOptionText, selected && styles.sheetOptionTextSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.sheetOptionSub, selected && styles.sheetOptionTextSelected]}>
                    {opt.sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0b10' },
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
  searchWrap: { paddingHorizontal: 20, marginBottom: 8 },
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
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  filterChip: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexShrink: 1,
  },
  filterChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  stateText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  errorIcon: { fontSize: 36, color: colors.textFaint },
  retryButton: {
    marginTop: 18,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(229,72,77,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229,72,77,0.45)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorBannerText: { color: colors.textMuted, fontSize: 13, flexShrink: 1, marginRight: 12 },
  errorBannerRetry: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpiCard: {
    flex: 1,
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
  },
  kpiLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  kpiValue: { fontSize: 22, fontWeight: '800' },
  kpiNote: { color: colors.textFaint, fontSize: 12, marginBottom: 4, marginTop: 2 },
  listTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 12, marginBottom: 12 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 36, color: colors.textFaint, marginBottom: 12 },
  emptyTitle: { color: colors.textMuted, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: colors.textFaint, fontSize: 13, textAlign: 'center', marginBottom: 18, lineHeight: 19 },
  resetButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  resetButtonText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
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
  card: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
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
  avatarText: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  cardTitleWrap: { flex: 1, marginRight: 8 },
  cardName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardMeta: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  detailRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  detailRowLast: { marginBottom: 0 },
  detailLabel: { color: colors.textFaint, fontSize: 13, fontWeight: '600', width: 80 },
  detailValue: { color: colors.text, fontSize: 13, flex: 1 },
  durationValue: { color: colors.accent, fontWeight: '700' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetBody: {
    backgroundColor: '#13161d',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '62%',
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  sheetOptionSelected: {
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  sheetOptionText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  sheetOptionSub: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  sheetOptionTextSelected: { color: colors.accent, fontWeight: '700' },
});