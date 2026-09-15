import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { getScanners, type ScannerItem, type ScannerStatus } from '../api/scanners';
import { useAuth } from '../auth/AuthContext';
import { useDrawer } from '../components/drawer/DrawerContext';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { AppStackParamList } from '../navigation/types';

type LoadingMode = 'initial' | 'refresh' | 'idle';

const STATUS_COLORS: Record<ScannerStatus, string> = {
  online: colors.success,
  offline: colors.textMuted,
  maintenance: '#f59e0b',
  disabled: colors.danger,
};

function relativeTime(iso?: string | null): string {
  if (!iso) return 'Never';
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'Never';
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function statusColor(status: ScannerStatus): string {
  return STATUS_COLORS[status] ?? colors.textMuted;
}

export function ScannerListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { user } = useAuth();
  const { setActive } = useDrawer();

  useEffect(() => {
    setActive('Scanners');
  }, [setActive]);

  const [mode, setMode] = useState<LoadingMode>('initial');
  const [error, setError] = useState<string | null>(null);
  const [scanners, setScanners] = useState<ScannerItem[]>([]);

  const fetchData = useCallback(async (kind: LoadingMode) => {
    setMode(kind);
    setError(null);
    try {
      const data = await getScanners();
      setScanners(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load scanners');
    } finally {
      setMode('idle');
    }
  }, []);

  useEffect(() => {
    fetchData('initial');
  }, [fetchData]);

  const onRefresh = useCallback(() => fetchData('refresh'), [fetchData]);

  const isSuperadmin = user?.role === 'superadmin';
  const onlineCount = scanners.filter((s) => s.status === 'online').length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Scanners"
        subtitle={isSuperadmin ? `${scanners.length} devices · ${onlineCount} online` : 'Access control devices'}
        right={
          !isSuperadmin ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('ScannerForm')}
              activeOpacity={0.7}
            >
              <Text style={styles.addBtnText}>+</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {mode === 'initial' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading scanners…</Text>
        </View>
      ) : error && scanners.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={scanners}
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
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Total</Text>
                  <Text style={[styles.kpiValue, { color: colors.accent }]}>{scanners.length}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Online</Text>
                  <Text style={[styles.kpiValue, { color: colors.success }]}>{onlineCount}</Text>
                </View>
              </View>
              <Text style={styles.listTitle}>Devices ({scanners.length})</Text>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>▰</Text>
              <Text style={styles.emptyTitle}>No scanners yet</Text>
              <Text style={styles.emptySubtitle}>
                {isSuperadmin
                  ? 'There are no registered devices to show. Branch admins can register eSSL K30 Pro devices.'
                  : 'Register an eSSL K30 Pro (or compatible device) so the gym gateway can push scan events into this app.'}
              </Text>
              {!isSuperadmin ? (
                <TouchableOpacity
                  style={styles.addFirstBtn}
                  onPress={() => navigation.navigate('ScannerForm')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addFirstBtnText}>Add scanner</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('ScannerDetails', { scannerId: item._id })}
            >
              <View style={styles.cardHead}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>▰</Text>
                </View>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.deviceId} · {item.model || item.brand}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { borderColor: statusColor(item.status) }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
                  <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Branch</Text>
                <Text style={styles.detailValue}>{item.branchCode || '---'}</Text>
                <Text style={styles.detailLabel}>Last seen</Text>
                <Text style={styles.detailValueRight}>{relativeTime(item.lastSeen)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
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
  listTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 12, marginBottom: 12 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 36, color: colors.textFaint, marginBottom: 12 },
  emptyTitle: { color: colors.textMuted, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 19,
  },
  addFirstBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  addFirstBtnText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
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
  detailRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  detailLabel: { color: colors.textFaint, fontSize: 13, fontWeight: '600' },
  detailValue: { color: colors.text, fontSize: 13, flex: 1 },
  detailValueRight: { color: colors.textMuted, fontSize: 13 },
});