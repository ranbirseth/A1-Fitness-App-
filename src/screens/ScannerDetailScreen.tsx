import React, { useCallback, useState } from 'react';
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
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useScanners } from '../mocks/ScannerProvider';
import {
  CONNECTION_METHOD_LABELS,
  connectionIdentifier,
  maskSecret,
  SCANNER_STATUS_META,
  type MockScanner,
} from '../mocks/scannerData';
import type { AppStackParamList } from '../navigation/types';

type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'done'; ok: boolean; message: string };

function fmt(iso?: string): string {
  if (!iso) return 'Never tested';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ScannerDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, 'ScannerDetail'>>();
  const { getScanner, runConnectionTest } = useScanners();

  const scannerId = route.params.scannerId;
  const [testState, setTestState] = useState<TestState>({ phase: 'idle' });

  const scanner: MockScanner | undefined = getScanner(scannerId);

  const onTest = useCallback(async () => {
    if (!scannerId) return;
    setTestState({ phase: 'testing' });
    const result = await runConnectionTest(scannerId);
    setTestState({ phase: 'done', ok: result.ok, message: result.message });
  }, [scannerId, runConnectionTest]);

  const startTest = useCallback(() => {
    Alert.alert('Test Connection', 'Run a mock connection test? No real hardware will be contacted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Test', onPress: onTest },
    ]);
  }, [onTest]);

  if (!scanner) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <SuperadminHeader title="Scanner" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.stateText}>This scanner configuration no longer exists.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const meta = SCANNER_STATUS_META[scanner.status];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <SuperadminHeader title={scanner.name} subtitle={`${scanner.model} · ${CONNECTION_METHOD_LABELS[scanner.connectionMethod]}`} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => setTestState({ phase: 'idle' })} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        <View style={styles.statusCard}>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <View style={styles.statusTextWrap}>
            <Text style={styles.statusLabel}>Demo Status</Text>
            <Text style={[styles.statusValue, { color: meta.color }]}>{meta.label}</Text>
            <Text style={styles.statusHint}>Last demo test: {fmt(scanner.lastTestedAt)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Device</Text>
        <View style={styles.card}>
          <InfoRow label="Name" value={scanner.name} />
          <InfoRow label="Model" value={scanner.model} />
          <InfoRow label="Branch" value={scanner.branchName} />
          <InfoRow label="Access" value={CONNECTION_METHOD_LABELS[scanner.connectionMethod]} />
          <InfoRow label="Status" value={`Configuration Saved`} />
        </View>

        <Text style={styles.sectionTitle}>Connection Details</Text>
        <View style={styles.card}>
          <InfoRow label="Connection" value={connectionIdentifier(scanner)} />
          {scanner.deviceId ? <InfoRow label="Device ID" value={scanner.deviceId} /> : null}
          {scanner.ipAddress ? <InfoRow label="IP Address" value={scanner.ipAddress} /> : null}
          {scanner.port ? <InfoRow label="Port" value={String(scanner.port)} /> : null}
          {scanner.apiUrl ? <InfoRow label="API URL" value={scanner.apiUrl} /> : null}
          {scanner.serverUrl ? <InfoRow label="Server URL" value={scanner.serverUrl} /> : null}
          {scanner.gatewayUrl ? <InfoRow label="Gateway URL" value={scanner.gatewayUrl} /> : null}
          {scanner.username ? <InfoRow label="Username" value={scanner.username} /> : null}
        </View>

        <Text style={styles.sectionTitle}>Credentials</Text>
        <View style={styles.card}>
          {scanner.password ? <InfoRow label="Password" value={maskSecret(scanner.password)} /> : null}
          {scanner.pushKey ? <InfoRow label="Push key" value={maskSecret(scanner.pushKey)} /> : null}
          {scanner.apiKey ? <InfoRow label="API key" value={maskSecret(scanner.apiKey)} /> : null}
          {!scanner.password && !scanner.pushKey && !scanner.apiKey ? (
            <Text style={styles.emptyRow}>No credentials stored.</Text>
          ) : null}
          <Text style={styles.secretNote}>Secrets are masked. Full passwords and keys are never shown.</Text>
        </View>

        {scanner.notes ? (
          <>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.card}>
              <Text style={styles.notesText}>{scanner.notes}</Text>
            </View>
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.testButton, testState.phase === 'testing' && styles.testButtonDisabled]}
          onPress={startTest}
          disabled={testState.phase === 'testing'}
          activeOpacity={0.85}
        >
          {testState.phase === 'testing' ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Text style={styles.testButtonText}>Test Connection (Demo)</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('ScannerSetup', { scannerId })}
          activeOpacity={0.85}
        >
          <Text style={styles.editButtonText}>Edit Scanner</Text>
        </TouchableOpacity>

        <Text style={styles.prototypeNote}>
          UI prototype only. The demo test simulates success/failure; it does not contact a real K30 Pro device or any
          backend. Real device verification will be added later.
        </Text>
      </ScrollView>

      <TestResultModal
        state={testState}
        onClose={() => setTestState({ phase: 'idle' })}
        onRetry={onTest}
      />
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function TestResultModal({
  state,
  onClose,
  onRetry,
}: {
  state: TestState;
  onClose: () => void;
  onRetry: () => void;
}) {
  const visible = state.phase !== 'idle';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBody}>
          {state.phase === 'testing' ? (
            <>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.modalTitle}>Testing connection…</Text>
              <Text style={styles.modalText}>Running a mock connectivity check. No hardware is being contacted.</Text>
            </>
          ) : state.phase === 'done' ? (
            <>
              <View style={[styles.resultDot, { backgroundColor: state.ok ? colors.success : colors.danger }]} />
              <Text style={[styles.modalTitle, { color: state.ok ? colors.success : colors.danger }]}>
                {state.ok ? 'Demo Connected' : 'Demo Failed'}
              </Text>
              <Text style={styles.modalText}>{state.message}</Text>
              <Text style={styles.modalSubtext}>This was a mock test (UI prototype). Real device verification will be added later.</Text>

              <TouchableOpacity style={[styles.modalButton, !state.ok && styles.modalButtonRetry]} onPress={state.ok ? onClose : onRetry} activeOpacity={0.85}>
                <Text style={[styles.modalButtonText, !state.ok && styles.modalButtonRetryText]}>
                  {state.ok ? 'Done' : 'Retry'}
                </Text>
              </TouchableOpacity>
              {!state.ok ? (
                <TouchableOpacity style={styles.modalLink} onPress={onClose} activeOpacity={0.85}>
                  <Text style={styles.modalLinkText}>Close</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorIcon: { fontSize: 36, color: colors.textFaint, marginBottom: 12 },
  stateText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 18 },
  retryButton: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 12 },
  retryButtonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
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
  statusTextWrap: { flex: 1 },
  statusLabel: { color: colors.textFaint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  statusHint: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
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
  emptyRow: { color: colors.textFaint, fontSize: 13, marginBottom: 10 },
  secretNote: { color: colors.textFaint, fontSize: 11.5, lineHeight: 16 },
  notesText: { color: colors.text, fontSize: 13.5, lineHeight: 19 },
  testButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  testButtonDisabled: { opacity: 0.7 },
  testButtonText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  editButton: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  editButtonText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  prototypeNote: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', paddingHorizontal: 24 },
  modalBody: {
    backgroundColor: '#151a20',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  resultDot: { width: 14, height: 14, borderRadius: 7, marginBottom: 12 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  modalText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: 'center' },
  modalSubtext: { color: colors.textFaint, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 10 },
  modalButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    width: '100%',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  modalButtonRetry: { backgroundColor: colors.danger },
  modalButtonText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  modalButtonRetryText: { color: '#fff' },
  modalLink: { marginTop: 12 },
  modalLinkText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});