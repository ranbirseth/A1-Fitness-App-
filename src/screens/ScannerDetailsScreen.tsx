import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import {
  disableScanner,
  getScanner,
  getSyncPayload,
  pingScanner,
  rotateScannerKey,
  updateScanner,
  type ScannerItem,
  type ScannerStatus,
} from '../api/scanners';
import { useAuth } from '../auth/AuthContext';
import { AppStackParamList } from '../navigation/types';

const STATUS_COLORS: Record<ScannerStatus, string> = {
  online: colors.success,
  offline: colors.textMuted,
  maintenance: '#f59e0b',
  disabled: colors.danger,
};

const STATUS_OPTIONS: ScannerStatus[] = ['online', 'offline', 'maintenance'];

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ScannerDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, 'ScannerDetails'>>();
  const { user } = useAuth();
  const scannerId = route.params.scannerId;

  const [scanner, setScanner] = useState<ScannerItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyModal, setKeyModal] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchData = useCallback(
    async (mode?: 'refresh') => {
      setError(null);
      if (mode) setLoading(true);
      try {
        setScanner(await getScanner(scannerId));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load scanner');
      } finally {
        setLoading(false);
      }
    },
    [scannerId]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const changeStatus = async (status: ScannerStatus) => {
    setScanner((prev) => (prev ? { ...prev, status } : prev));
    try {
      const updated = await updateScanner(scannerId, { status });
      setScanner(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
      fetchData();
    }
  };

  const onRotateKey = () => {
    Alert.alert('Rotate API key', 'The device gateway must be updated with the new key, or pushes will fail. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Rotate',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await rotateScannerKey(scannerId);
            setKeyModal(res.apiKey);
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to rotate key');
          }
        },
      },
    ]);
  };

  const onDisable = () => {
    Alert.alert(
      'Disable scanner',
      'Disabling stops processing its events. Event history is preserved. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            try {
              await disableScanner(scannerId);
              setScanner(await getScanner(scannerId));
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to disable scanner');
            }
          },
        },
      ]
    );
  };

  const onSync = async () => {
    try {
      const res = await getSyncPayload(scannerId);
      setSyncResult(
        `${res.count} member(s) ready for enrollment (${res.members.filter((m) => m.active).length} active).`
      );
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to generate sync payload');
    }
  };

  const onPing = async () => {
    try {
      const res = await pingScanner(scannerId);
      const lastSeen = res.lastSeen ? new Date(res.lastSeen).toLocaleString('en-IN') : 'never';
      Alert.alert(
        res.status === 'online' ? 'Device online' : 'Device offline',
        `${res.deviceId} is reported ${res.status.toUpperCase()}\nLast seen: ${lastSeen}\nAge: ${
          res.ageMs != null ? ((res.ageMs / 1000).toFixed(1) + 's') : '—'
        }\nThreshold: ${(res.thresholdMs / 1000).toFixed(0)}s`
      );
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to test connection');
    }
  };

  const isSuperadmin = user?.role === 'superadmin';
  const statusColor = scanner ? STATUS_COLORS[scanner.status] : colors.textMuted;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7} hitSlop={8}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {scanner?.name ?? 'Scanner'}
          </Text>
          <Text style={styles.subtitle}>{scanner ? `${scanner.deviceId} · ${scanner.branchCode}` : 'Device details'}</Text>
        </View>
        {!isSuperadmin ? (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('ScannerForm', { scannerId })}
            activeOpacity={0.7}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading scanner…</Text>
        </View>
      ) : error && !scanner ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchData('refresh')} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : scanner ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => fetchData('refresh')} tintColor={colors.accent} colors={[colors.accent]} />
          }
        >
          {error ? <Text style={styles.inlineError}>{error}</Text> : null}

          <View style={styles.statusCard}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <View>
              <Text style={styles.statusLabel}>STATUS</Text>
              <Text style={[styles.statusValue, { color: statusColor }]}>{scanner.status.toUpperCase()}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Device</Text>
          <View style={styles.card}>
            <InfoRow label="Name" value={scanner.name} />
            <InfoRow label="Device ID" value={scanner.deviceId} />
            <InfoRow label="Serial" value={scanner.serial || '—'} />
            <InfoRow label="Brand / Model" value={`${scanner.brand || '—'} / ${scanner.model || '—'}`} />
            <InfoRow label="Type" value={scanner.type} />
            <InfoRow label="Protocol" value={scanner.protocol} />
            <InfoRow label="IP Address" value={scanner.ipAddress || '—'} />
            <InfoRow label="Port" value={String(scanner.port ?? '—')} />
          </View>

          <Text style={styles.sectionTitle}>Health</Text>
          <View style={styles.card}>
            <InfoRow label="Last seen" value={fmt(scanner.lastSeen)} />
            <InfoRow label="Last event" value={fmt(scanner.lastEventAt)} />
            <InfoRow label="Last sync" value={fmt(scanner.lastSync)} />
          </View>

          {!isSuperadmin ? (
            <>
              <Text style={styles.sectionTitle}>Actions</Text>
              <View style={styles.card}>
                <Text style={styles.actionLabel}>Status</Text>
                <View style={styles.chipRow}>
                  {STATUS_OPTIONS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.chip, scanner.status === s && styles.chipSelected]}
                      onPress={() => changeStatus(s)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, scanner.status === s && styles.chipTextSelected]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.actionButton} onPress={onPing} activeOpacity={0.85}>
                  <Text style={styles.actionButtonText}>Test connection</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButton} onPress={onSync} activeOpacity={0.85}>
                  <Text style={styles.actionButtonText}>Generate enrollment payload</Text>
                </TouchableOpacity>
                {syncResult ? <Text style={styles.syncResult}>{syncResult}</Text> : null}

                <TouchableOpacity style={[styles.actionButton, styles.actionButtonGhost]} onPress={onRotateKey} activeOpacity={0.85}>
                  <Text style={[styles.actionButtonText, styles.actionButtonGhostText]}>Rotate API key</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.actionButton, styles.actionButtonDanger]} onPress={onDisable} activeOpacity={0.85}>
                  <Text style={[styles.actionButtonText, styles.actionButtonDangerText]}>
                    {scanner.status === 'disabled' ? 'Re-enable device' : 'Disable scanner'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <Text style={styles.footerNote}>
            {
              isSuperadmin
                ? 'Superadmin access is read-only. Ask a branch admin to edit, disable, rotate keys, or sync this device.'
                : `Device events use the x-scanner-key header with this device's API key (visible at creation / rotation).`
            }
          </Text>
        </ScrollView>
      ) : null}

      <Modal visible={!!keyModal} transparent animationType="fade" onRequestClose={() => setKeyModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBody}>
            <Text style={styles.modalTitle}>API key rotated</Text>
            <Text style={styles.modalText}>
              Update the gateway to send this key in the x-scanner-key header. It will not be shown again.
            </Text>
            <View style={styles.apiKeyBox}>
              <Text style={styles.apiKeyText} selectable>
                {keyModal}
              </Text>
            </View>
            <TouchableOpacity style={styles.modalButton} onPress={() => setKeyModal(null)} activeOpacity={0.85}>
              <Text style={styles.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  backButton: {
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
  backIcon: { color: colors.text, fontSize: 22, fontWeight: '700' },
  titleWrap: { flex: 1 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  editBtn: {
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  editBtnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  stateText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12 },
  errorIcon: { fontSize: 36, color: colors.textFaint },
  retryButton: { marginTop: 18, backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryButtonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  inlineError: { color: colors.danger, fontSize: 13, marginBottom: 12 },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 14 },
  statusLabel: { color: colors.textFaint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  statusValue: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },
  card: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 14,
  },
  infoRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  infoLabel: { color: colors.textFaint, fontSize: 13, fontWeight: '600', width: 100 },
  infoValue: { color: colors.text, fontSize: 13, flex: 1 },
  actionLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: 'rgba(139,92,246,0.18)' },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  chipTextSelected: { color: colors.accent },
  actionButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionButtonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  actionButtonGhost: { backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.border },
  actionButtonGhostText: { color: colors.textMuted },
  actionButtonDanger: { backgroundColor: 'rgba(229,72,77,0.15)', borderWidth: 1, borderColor: 'rgba(229,72,77,0.5)' },
  actionButtonDangerText: { color: colors.danger },
  syncResult: { color: colors.success, fontSize: 13, marginBottom: 12 },
  footerNote: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', paddingHorizontal: 24 },
  modalBody: {
    backgroundColor: '#151a20',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 22,
  },
  modalTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginBottom: 10 },
  modalText: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  apiKeyBox: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    marginBottom: 18,
  },
  apiKeyText: { color: colors.accent, fontSize: 13, fontFamily: 'monospace' },
  modalButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: { color: colors.text, fontSize: 15, fontWeight: '800' },
});