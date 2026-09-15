import React, { useEffect, useMemo, useState } from 'react';
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
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useAuth } from '../auth/AuthContext';
import { useScanners } from '../mocks/ScannerProvider';
import {
  CONNECTION_METHOD_LABELS,
  CONNECTION_METHOD_OPTIONS,
  SCANNER_MODEL_OPTIONS,
  type ScannerConnectionMethod,
  type MockScanner,
  type ScannerFormValues,
  resolveMockBranches,
  validateScannerValues,
} from '../mocks/scannerData';
import type { AppStackParamList } from '../navigation/types';

interface Option {
  key: string;
  label: string;
  sub?: string;
}

function formFromScanner(s: MockScanner): ScannerFormValues {
  return {
    name: s.name,
    model: s.model,
    branchId: s.branchId,
    branchName: s.branchName,
    connectionMethod: s.connectionMethod,
    ipAddress: s.ipAddress ?? '',
    port: s.port ? String(s.port) : '',
    deviceId: s.deviceId ?? '',
    username: s.username ?? '',
    password: '',
    apiUrl: s.apiUrl ?? '',
    serverUrl: s.serverUrl ?? '',
    gatewayUrl: s.gatewayUrl ?? '',
    pushKey: '',
    apiKey: '',
    notes: s.notes ?? '',
  };
}

export function ScannerSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, 'ScannerSetup'>>();
  const { user } = useAuth();
  const { getScanner, addScanner, updateScanner } = useScanners();

  const scannerId = route.params?.scannerId;
  const editing = !!scannerId;

  const branches = useMemo(() => resolveMockBranches(user?.branchCode), [user?.branchCode]);
  const defaultBranch = useMemo(() => {
    const code = (user?.branchCode || '').trim().toUpperCase();
    return branches.find((b) => b.branchCode === code) ?? branches[0];
  }, [branches, user?.branchCode]);

  const [loading, setLoading] = useState(editing);
  const [form, setForm] = useState<ScannerFormValues>(() =>
    editing
      ? formFromScanner(getScanner(scannerId) ?? ({} as MockScanner))
      : {
          name: '',
          model: SCANNER_MODEL_OPTIONS[0],
          branchId: defaultBranch?.id ?? '',
          branchName: defaultBranch?.name ?? '',
          connectionMethod: 'TCP/IP',
          ipAddress: '',
          port: '8200',
          deviceId: '',
          username: '',
          password: '',
          apiUrl: '',
          serverUrl: '',
          gatewayUrl: '',
          pushKey: '',
          apiKey: '',
          notes: '',
        }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [modelSheet, setModelSheet] = useState(false);
  const [branchSheet, setBranchSheet] = useState(false);

  useEffect(() => {
    if (!editing) {
      setLoading(false);
      return;
    }
    const scanner = getScanner(scannerId);
    if (!scanner) {
      Alert.alert('Not found', 'This scanner configuration does not exist anymore.');
      navigation.goBack();
      return;
    }
    setForm(formFromScanner(scanner));
    setLoading(false);
  }, [scannerId, editing, getScanner, navigation]);

  const set = <K extends keyof ScannerFormValues>(key: K, value: ScannerFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const onSave = () => {
    const nextErrors = validateScannerValues(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      Alert.alert('Check the form', 'Please fix the highlighted fields before saving.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        updateScanner(scannerId, form);
      } else {
        addScanner(form);
      }
      Alert.alert('Configuration Saved', 'Scanner saved to mock local state.\n\nStatus: Not Tested (Pending Hardware Test).\nThis is a UI prototype only – no device was contacted.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (e: unknown) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unable to save the scanner configuration.');
    } finally {
      setSaving(false);
    }
  };

  const method = form.connectionMethod;
  const lastTested = editing ? getScanner(scannerId)?.lastTestedAt : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <SuperadminHeader
        title={editing ? 'Edit Scanner' : 'Add Scanner'}
        subtitle={editing ? 'Update the mock scanner configuration' : 'Configure an attendance scanner (mock)'}
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading scanner…</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}
        >
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>Basic Information</Text>

            <Field label="Scanner name *" error={errors.name}>
              <TextInput
                style={[styles.input, errors.name && styles.inputError]}
                value={form.name}
                onChangeText={(v) => set('name', v)}
                placeholder="e.g. Front Door"
                placeholderTextColor={colors.textFaint}
              />
            </Field>

            <Field label="Scanner model *" error={errors.model}>
              <TouchableOpacity
                style={styles.selectInput}
                onPress={() => setModelSheet(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.selectText, !form.model && styles.selectPlaceholder]}>{form.model || 'Choose a model'}</Text>
                <Text style={styles.selectChevron}>▾</Text>
              </TouchableOpacity>
            </Field>

            <Field label="Branch *" error={errors.branchId}>
              <TouchableOpacity
                style={styles.selectInput}
                onPress={() => setBranchSheet(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.selectText} numberOfLines={1}>
                  {form.branchName || 'Choose a branch'}
                </Text>
                <Text style={styles.selectChevron}>▾</Text>
              </TouchableOpacity>
              <Text style={styles.hintText}>Any branch can be selected in this prototype – no backend restriction applied.</Text>
            </Field>

            <Text style={styles.sectionLabel}>Connection Method</Text>
            <View style={styles.chipWrap}>
              {CONNECTION_METHOD_OPTIONS.map((m) => {
                const selected = method === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => set('connectionMethod', m)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {CONNECTION_METHOD_LABELS[m]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Connection Credentials</Text>
            {credentialFields(method, errors).map((f) => (
              <Field key={f.key} label={f.label} error={f.error}>
                <TextInput
                  style={[styles.input, f.error && styles.inputError]}
                  value={form[f.key]}
                  onChangeText={(v) => set(f.key as keyof ScannerFormValues, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize={f.secure ? 'none' : 'sentences'}
                  autoCorrect={false}
                  secureTextEntry={f.secure}
                  keyboardType={f.numeric ? 'numeric' : 'default'}
                />
              </Field>
            ))}

            {method === 'USB' || method === 'OTHER' ? (
              <Text style={styles.hintText}>
                {method === 'USB'
                  ? 'USB devices are detected on the gateway. Only an optional device ID is needed here.'
                  : 'Use the notes field below to describe the standard protocol or custom device.'}
              </Text>
            ) : null}

            <Field label="Notes">
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={form.notes}
                onChangeText={(v) => set('notes', v)}
                placeholder="Optional notes for this scanner"
                placeholderTextColor={colors.textFaint}
                multiline
              />
            </Field>

            {editing && lastTested ? (
              <Text style={styles.hintText}>
                Last demo test: {new Date(lastTested).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
            ) : null}

            <Text style={styles.prototypeNote}>
              UI prototype: configurations are stored in mock local state only. No credentials are sent anywhere and
              no hardware is contacted.
            </Text>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={onSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={styles.saveButtonText}>{editing ? 'Save Changes' : 'Save Scanner'}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <OptionSheet
        title="Choose model"
        visible={modelSheet}
        options={SCANNER_MODEL_OPTIONS.map((m) => ({ key: m, label: m }))}
        selectedKey={form.model}
        onClose={() => setModelSheet(false)}
        onSelect={(key) => {
          set('model', key);
          setModelSheet(false);
        }}
      />

      <OptionSheet
        title="Choose branch"
        visible={branchSheet}
        options={branches.map((b) => ({ key: b.id, label: b.name, sub: b.branchCode }))}
        selectedKey={form.branchId}
        onClose={() => setBranchSheet(false)}
        onSelect={(key) => {
          const branch = branches.find((b) => b.id === key);
          if (branch) {
            set('branchId', branch.id);
            set('branchName', branch.name);
          }
          setBranchSheet(false);
        }}
      />
    </SafeAreaView>
  );
}

interface CredField {
  key: keyof ScannerFormValues;
  label: string;
  placeholder: string;
  secure?: boolean;
  numeric?: boolean;
  error?: string;
}

function credentialFields(
  method: ScannerConnectionMethod,
  errors: Record<string, string>
): CredField[] {
  const base: CredField[] = [];
  switch (method) {
    case 'TCP/IP':
      base.push(
        { key: 'ipAddress', label: 'Device IP address *', placeholder: '192.168.1.10', error: errors.ipAddress },
        { key: 'port', label: 'Port *', placeholder: '8200', numeric: true, error: errors.port },
        { key: 'deviceId', label: 'Device ID (optional)', placeholder: 'K30-PRO-001', error: errors.deviceId },
        { key: 'username', label: 'Username (optional)', placeholder: 'admin', error: errors.username }
      );
      base.push({ key: 'password', label: 'Password / API key', placeholder: '••••••••', secure: true, error: errors.password });
      break;
    case 'HTTP/API':
      base.push(
        { key: 'apiUrl', label: 'API URL *', placeholder: 'https://examples.com/api/scanner', error: errors.apiUrl },
        { key: 'deviceId', label: 'Device ID (optional)', placeholder: 'K30-001', error: errors.deviceId },
        { key: 'username', label: 'Username (optional)', placeholder: 'admin', error: errors.username }
      );
      base.push({ key: 'password', label: 'Password / API key', placeholder: '••••••••', secure: true, error: errors.password });
      break;
    case 'ADMS/PUSH':
      base.push(
        { key: 'serverUrl', label: 'Server URL *', placeholder: 'https://push.example.com/adms', error: errors.serverUrl },
        { key: 'deviceId', label: 'Device ID (optional)', placeholder: 'K30-ADMS-004', error: errors.deviceId }
      );
      base.push({ key: 'pushKey', label: 'Push key / API key *', placeholder: '••••••••••', secure: true, error: errors.pushKey });
      break;
    case 'USB':
      base.push({ key: 'deviceId', label: 'Device ID (optional)', placeholder: 'USB-READER-1', error: errors.deviceId });
      break;
    case 'LOCAL_GATEWAY':
      base.push(
        { key: 'gatewayUrl', label: 'Gateway URL *', placeholder: 'http://192.168.1.5:9000', error: errors.gatewayUrl },
        { key: 'deviceId', label: 'Device ID (optional)', placeholder: 'GW-01', error: errors.deviceId }
      );
      base.push({ key: 'apiKey', label: 'API key (optional)', placeholder: '••••••••••', secure: true, error: errors.apiKey });
      break;
    case 'OTHER':
      base.push({ key: 'deviceId', label: 'Device ID (optional)', placeholder: 'Device identifier', error: errors.deviceId });
      break;
  }
  return base;
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function OptionSheet({
  title,
  visible,
  options,
  selectedKey,
  onClose,
  onSelect,
}: {
  title: string;
  visible: boolean;
  options: Option[];
  selectedKey: string;
  onClose: () => void;
  onSelect: (key: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((opt) => {
              const selected = opt.key === selectedKey;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sheetOption, selected && styles.sheetOptionSelected]}
                  onPress={() => onSelect(opt.key)}
                  activeOpacity={0.8}
                >
                  <View style={styles.sheetTextWrap}>
                    <Text style={[styles.sheetOptionText, selected && styles.sheetOptionTextSelected]}>{opt.label}</Text>
                    {opt.sub ? <Text style={styles.sheetOptionSub}>{opt.sub}</Text> : null}
                  </View>
                  {selected ? <Text style={styles.sheetCheck}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  stateText: { color: colors.textMuted, fontSize: 14, marginTop: 12 },
  form: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 10,
  },
  field: { marginBottom: 14 },
  fieldLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 5 },
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
  inputError: { borderColor: 'rgba(229,72,77,0.7)' },
  notesInput: { height: 84, paddingTop: 12, textAlignVertical: 'top' },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 14,
  },
  selectText: { color: colors.text, fontSize: 14, flex: 1, marginRight: 8 },
  selectPlaceholder: { color: colors.textFaint },
  selectChevron: { color: colors.textMuted, fontSize: 14 },
  hintText: { color: colors.textFaint, fontSize: 12, marginTop: 6, lineHeight: 17 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: colors.inputBackground,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: 'rgba(139,92,246,0.18)' },
  chipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  chipTextSelected: { color: colors.accent, fontWeight: '700' },
  prototypeNote: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: colors.text, fontSize: 15, fontWeight: '800' },
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
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  sheetOptionSelected: { borderColor: 'rgba(139,92,246,0.5)', backgroundColor: 'rgba(139,92,246,0.15)' },
  sheetTextWrap: { flex: 1, marginRight: 10 },
  sheetOptionText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  sheetOptionSub: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  sheetOptionTextSelected: { color: colors.accent, fontWeight: '700' },
  sheetCheck: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});