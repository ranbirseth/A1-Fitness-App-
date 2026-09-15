import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useDrawer } from '../components/drawer/DrawerContext';
import { useScanners } from '../mocks/ScannerProvider';
import {
  connectionIdentifier,
  CONNECTION_METHOD_LABELS,
  SCANNER_STATUS_META,
  sortScanners,
  type MockScanner,
  type ScannerStatus,
} from '../mocks/scannerData';
import type { AppStackParamList } from '../navigation/types';

function relativeTime(iso?: string): string {
  if (!iso) return 'Never tested';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (isNaN(diffMs) || diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function ScannerIntegrationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { setActive } = useDrawer();
  const { scanners, testingIds, removeScanner, runConnectionTest } = useScanners();

  useEffect(() => {
    setActive('Attendance');
  }, [setActive]);

  const sorted = useMemo(() => sortScanners(scanners), [scanners]);

  const stats = useMemo(() => {
    const connected = sorted.filter((s) => SCANNER_STATUS_META[s.status].group === 'connected').length;
    const pending = sorted.filter((s) => SCANNER_STATUS_META[s.status].group === 'pending').length;
    const offline = sorted.filter((s) => SCANNER_STATUS_META[s.status].group === 'offline').length;
    return { total: sorted.length, connected, pending, offline };
  }, [sorted]);

  const onTest = useCallback(
    (scanner: MockScanner) => {
      Alert.alert('Test Connection', `Run a mock connection test for "${scanner.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Test',
          onPress: async () => {
            const result = await runConnectionTest(scanner.id);
            Alert.alert(
              result.ok ? 'Demo Connected' : 'Demo Failed',
              `${result.message}\n\nThis was a mock test only – no hardware was contacted.`,
              result.ok
                ? [{ text: 'OK' }]
                : [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Retry', onPress: () => onTest(scanner) },
                  ]
            );
          },
        },
      ]);
    },
    [runConnectionTest]
  );

  const onRemove = useCallback(
    (scanner: MockScanner) => {
      Alert.alert('Remove scanner', `Remove "${scanner.name}" from the mock configuration?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeScanner(scanner.id),
        },
      ]);
    },
    [removeScanner]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Scanner Integration"
        subtitle="Connect and test attendance scanners – UI prototype"
        right={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('ScannerSetup')}
            activeOpacity={0.7}
          >
            <Text style={styles.addBtnText}>＋</Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.introCard}>
              <View style={styles.introIconWrap}>
                <Text style={styles.introIcon}>▰</Text>
              </View>
              <View style={styles.introTextWrap}>
                <Text style={styles.introTitle}>Attendance scanner setup</Text>
                <Text style={styles.introText}>
                  Configure access-control devices for any branch. This is a UI prototype –
                  nothing here connects to real hardware or a backend.
                </Text>
              </View>
            </View>

            <View style={styles.statsWrap}>
              <StatCard label="Total" value={stats.total} color={colors.accent} />
              <StatCard label="Connected" value={stats.connected} color={colors.success} />
              <StatCard label="Pending" value={stats.pending} color="#f59e0b" />
              <StatCard label="Offline" value={stats.offline} color={colors.textMuted} />
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Configured Scanners ({stats.total})</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>◎</Text>
            <Text style={styles.emptyTitle}>No scanners configured</Text>
            <Text style={styles.emptySubtitle}>
              Add a scanner to start preparing the attendance integration flow. Configurations are saved in mock
              local state only.
            </Text>
            <TouchableOpacity
              style={styles.emptyAddBtn}
              onPress={() => navigation.navigate('ScannerSetup')}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyAddBtnText}>Add Scanner</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <ScannerCard
            scanner={item}
            testing={testingIds.includes(item.id)}
            onDetails={() => navigation.navigate('ScannerDetail', { scannerId: item.id })}
            onEdit={() => navigation.navigate('ScannerSetup', { scannerId: item.id })}
            onTest={() => onTest(item)}
            onRemove={() => onRemove(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function statusColor(status: ScannerStatus): string {
  return SCANNER_STATUS_META[status].color;
}

const ScannerCard = React.memo(function ScannerCard({
  scanner,
  testing,
  onDetails,
  onEdit,
  onTest,
  onRemove,
}: {
  scanner: MockScanner;
  testing: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onTest: () => void;
  onRemove: () => void;
}) {
  const meta = SCANNER_STATUS_META[scanner.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>▰</Text>
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardName} numberOfLines={1}>
            {scanner.name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {scanner.model} · {CONNECTION_METHOD_LABELS[scanner.connectionMethod]}
          </Text>
        </View>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Branch</Text>
        <Text style={styles.detailValue} numberOfLines={1}>
          {scanner.branchName}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Connection</Text>
        <Text style={styles.detailValue} numberOfLines={1}>
          {connectionIdentifier(scanner)}
        </Text>
      </View>
      <View style={[styles.detailRow, styles.detailRowLast]}>
        <Text style={styles.detailLabel}>Status</Text>
        <View style={styles.statusWrap}>
          {testing ? (
            <View style={styles.statusInline}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.testingText}>Testing…</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { borderColor: meta.color }]}>
              <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          )}
          <Text style={styles.testedHint}>Last test: {relativeTime(scanner.lastTestedAt)}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <ActionButton label="Details" onPress={onDetails} />
        <ActionButton label="Edit" onPress={onEdit} />
        <TouchableOpacity
          style={[styles.actionBtn, testing && styles.actionBtnDisabled]}
          onPress={onTest}
          disabled={testing}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>{testing ? 'Testing…' : 'Test connection'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={onRemove} activeOpacity={0.85}>
          <Text style={styles.actionBtnDangerText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.actionBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(30,32,44,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.accent, fontSize: 20, fontWeight: '700' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  introCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  introIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  introIcon: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  introTextWrap: { flex: 1 },
  introTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  introText: { color: colors.textFaint, fontSize: 12.5, lineHeight: 18 },
  statsWrap: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.textFaint, fontSize: 11, fontWeight: '600', marginTop: 4, textTransform: 'uppercase' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  emptyBox: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 36, color: colors.textFaint, marginBottom: 12 },
  emptyTitle: { color: colors.textMuted, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: colors.textFaint, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  emptyAddBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  emptyAddBtnText: { color: colors.text, fontSize: 14, fontWeight: '700' },
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
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  detailRowLast: { marginBottom: 12 },
  detailLabel: { color: colors.textFaint, fontSize: 13, fontWeight: '600', width: 72 },
  detailValue: { color: colors.text, fontSize: 13, flex: 1 },
  statusWrap: { flex: 1, gap: 6 },
  statusInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  testingText: { color: colors.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
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
  testedHint: { color: colors.textFaint, fontSize: 11.5 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: colors.accent, fontSize: 12.5, fontWeight: '700' },
  actionBtnDanger: { borderColor: 'rgba(229,72,77,0.5)' },
  actionBtnDangerText: { color: colors.danger, fontSize: 12.5, fontWeight: '700' },
});