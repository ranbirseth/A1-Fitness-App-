import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { createScanner, getScanner, updateScanner, type ScannerProtocol, type ScannerType } from '../api/scanners';
import { useAuth } from '../auth/AuthContext';
import { AppStackParamList } from '../navigation/types';

const PROTOCOLS: ScannerProtocol[] = ['tcp', 'usb', 'p2p'];
const TYPES: ScannerType[] = ['fingerprint', 'card', 'fingerprint_card', 'face'];

export function ScannerFormScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, 'ScannerForm'>>();
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const scannerId = route.params?.scannerId;

  const [loading, setLoading] = useState(!!scannerId);
  const [saving, setSaving] = useState(false);
  const [apiKeyModal, setApiKeyModal] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [serial, setSerial] = useState('');
  const [brand, setBrand] = useState('eSSL');
  const [model, setModel] = useState('K30 Pro');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('8200');
  const [protocol, setProtocol] = useState<ScannerProtocol>('tcp');
  const [type, setType] = useState<ScannerType>('fingerprint_card');
  const [branchCode, setBranchCode] = useState(isSuperadmin ? '' : (user?.branchCode || 'MAIN'));
  const [checkOutOnSecondScan, setCheckOutOnSecondScan] = useState(true);

  useEffect(() => {
    if (!scannerId) {
      setLoading(false);
      return;
    }
    getScanner(scannerId)
      .then((s) => {
        setName(s.name);
        setDeviceId(s.deviceId);
        setSerial(s.serial ?? '');
        setBrand(s.brand ?? '');
        setModel(s.model ?? '');
        setIpAddress(s.ipAddress ?? '');
        setPort(String(s.port ?? 8200));
        setProtocol(s.protocol ?? 'tcp');
        setType(s.type ?? 'fingerprint_card');
        setBranchCode(s.branchCode);
        setCheckOutOnSecondScan(s.settings?.enableCheckOutOnSecondScan ?? true);
      })
      .catch((e: unknown) => {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load scanner');
        navigation.goBack();
      })
      .finally(() => setLoading(false));
  }, [scannerId, navigation]);

  const onSave = async () => {
    const trimmedName = name.trim();
    const trimmedDeviceId = deviceId.trim();
    if (!trimmedName || !trimmedDeviceId) {
      Alert.alert('Missing fields', 'Name and Device ID are required.');
      return;
    }

    const common = {
      name: trimmedName,
      serial: serial.trim() || undefined,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      ipAddress: ipAddress.trim() || undefined,
      port: Number(port) || 8200,
      protocol,
      type,
      settings: { enforceMembership: true, enableCheckOutOnSecondScan: checkOutOnSecondScan },
    };

    setSaving(true);
    try {
      if (scannerId) {
        await updateScanner(scannerId, common);
        Alert.alert('Saved', 'Scanner updated.');
        navigation.goBack();
      } else {
        const created = await createScanner({
          ...common,
          deviceId: trimmedDeviceId,
          branchCode: branchCode.trim().toUpperCase() || 'MAIN',
        });
        if (created.apiKey) {
          setApiKeyModal(created.apiKey);
        } else {
          Alert.alert('Created', 'Scanner registered.');
          navigation.goBack();
        }
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save scanner');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7} hitSlop={8}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{scannerId ? 'Edit Scanner' : 'Add Scanner'}</Text>
          <Text style={styles.subtitle}>
            {scannerId ? 'Update device registration details' : 'Register an access-control device'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading scanner…</Text>
        </View>
      ) : isSuperadmin ? (
        <View style={styles.centered}>
          <Text style={styles.readOnlyIcon}>▰</Text>
          <Text style={styles.readOnlyTitle}>Read-only access</Text>
          <Text style={styles.readOnlyText}>
            Scanner registration and editing are managed by branch admins. You can view devices from
            the scanner list.
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}
        >
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Field label="Name *">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Front Door"
              placeholderTextColor={colors.textFaint}
            />
          </Field>
          <Field label="Device ID *">
            <TextInput
              style={styles.input}
              value={deviceId}
              onChangeText={setDeviceId}
              editable={!scannerId}
              placeholder="e.g. K30-001"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </Field>
          <Field label="Serial">
            <TextInput
              style={styles.input}
              value={serial}
              onChangeText={setSerial}
              placeholder="Device serial number"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
            />
          </Field>

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <Field label="Brand">
                <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholder="eSSL" placeholderTextColor={colors.textFaint} />
              </Field>
            </View>
            <View style={styles.rowHalf}>
              <Field label="Model">
                <TextInput style={styles.input} value={model} onChangeText={setModel} placeholder="K30 Pro" placeholderTextColor={colors.textFaint} />
              </Field>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <Field label="IP Address">
                <TextInput
                  style={styles.input}
                  value={ipAddress}
                  onChangeText={setIpAddress}
                  placeholder="192.168.1.100"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="numeric"
                  autoCapitalize="none"
                />
              </Field>
            </View>
            <View style={styles.rowHalf}>
              <Field label="Port">
                <TextInput
                  style={styles.input}
                  value={port}
                  onChangeText={setPort}
                  placeholder="8200"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                />
              </Field>
            </View>
          </View>

          {isSuperadmin ? (
            <Field label="Branch Code">
              <TextInput
                style={styles.input}
                value={branchCode}
                onChangeText={setBranchCode}
                placeholder="MAIN"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
              />
            </Field>
          ) : null}

          <Field label="Protocol">
            <View style={styles.chipRow}>
              {PROTOCOLS.map((p) => (
                <Chip key={p} label={p.toUpperCase()} onPress={() => setProtocol(p)} selected={protocol === p} />
              ))}
            </View>
          </Field>

          <Field label="Reader Type">
            <View style={styles.chipRow}>
              {TYPES.map((t) => (
                <Chip key={t} label={t.replace('_', ' + ')} onPress={() => setType(t)} selected={type === t} />
              ))}
            </View>
          </Field>

          <Field label="Check-out on second scan">
            <ToggleRow
              value={checkOutOnSecondScan}
              onChange={setCheckOutOnSecondScan}
              detail="Second successful scan of the day marks the member checked out."
            />
          </Field>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={onSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.saveButtonText}>{scannerId ? 'Save Changes' : 'Register Scanner'}</Text>
            )}
          </TouchableOpacity>

          {scannerId ? (
            <Text style={styles.hint}>Device ID cannot be changed after registration.</Text>
          ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={!!apiKeyModal} transparent animationType="fade" onRequestClose={() => { setApiKeyModal(null); navigation.goBack(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBody}>
            <Text style={styles.modalTitle}>Scanner registered</Text>
            <Text style={styles.modalText}>
              Configure the device gateway to push events using this API key in the{' '}
              <Text style={styles.modalCode}>x-scanner-key</Text> header (or the gym-wide push secret). It will
              not be shown again.
            </Text>
            <View style={styles.apiKeyBox}>
              <Text style={styles.apiKeyText} selectable>
                {apiKeyModal}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setApiKeyModal(null);
                navigation.goBack();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ToggleRow({
  value,
  onChange,
  detail,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  detail: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleDetail}>{detail}</Text>
      <TouchableOpacity
        style={[styles.toggle, value && styles.toggleOn]}
        onPress={() => onChange(!value)}
        activeOpacity={0.8}
      >
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  readOnlyIcon: { fontSize: 36, color: colors.textFaint, marginBottom: 12 },
  readOnlyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  readOnlyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  stateText: { color: colors.textMuted, fontSize: 14, marginTop: 12 },
  form: { paddingHorizontal: 20, paddingBottom: 40 },
  field: { marginBottom: 16 },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 12 },
  rowHalf: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.inputBackground,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(139,92,246,0.18)',
  },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: colors.accent, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toggleDetail: { color: colors.textMuted, fontSize: 13, flex: 1, marginRight: 12 },
  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    padding: 2,
  },
  toggleOn: { backgroundColor: colors.accent },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleKnobOn: { transform: [{ translateX: 20 }], backgroundColor: '#fff' },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  hint: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 12 },
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
  modalCode: { color: colors.accent, fontWeight: '700' },
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