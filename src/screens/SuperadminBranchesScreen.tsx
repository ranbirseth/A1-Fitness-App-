import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import {
  type BranchCreatePayload,
  type BranchItem,
  type BranchUpdatePayload,
  createBranch,
  deleteBranch,
  getBranches,
  updateBranch,
} from '../api/branches';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useDrawer } from '../components/drawer/DrawerContext';
import { StatusBadge } from '../components/StatusBadge';
import type { AppStackParamList } from '../navigation/types';

const BRANCH_CODE_REGEX = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

interface BranchFormValues {
  name: string;
  branchCode: string;
  address: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
}

function blankForm(): BranchFormValues {
  return { name: '', branchCode: '', address: '', phone: '', email: '', status: 'active' };
}

export function SuperadminBranchesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { setActive } = useDrawer();

  useEffect(() => {
    setActive('Branches');
  }, [setActive]);

  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFocused = useRef(false);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<BranchItem | null>(null);
  const [form, setForm] = useState<BranchFormValues>(blankForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const items = await getBranches();
      setBranches(items);
    } catch (err) {
      setError(messageFrom(err, 'Failed to load branches. Please try again.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load('initial');
  }, [load]);

  // Reload whenever the screen regains focus (after returning from
  // BranchDetails or any other navigation) so the list stays in sync with the
  // backend — a branch deleted/edited elsewhere never lingers as stale data.
  // The first focus coincides with mount (handled by the initial load), so it
  // is skipped to avoid a duplicate fetch.
  useFocusEffect(
    useCallback(() => {
      if (!hasFocused.current) {
        hasFocused.current = true;
        return;
      }
      load('refresh');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(blankForm());
    setFormErrors({});
    setFormVisible(true);
  }, []);

  const openEdit = useCallback((branch: BranchItem) => {
    setEditing(branch);
    setForm({
      name: branch.name ?? '',
      branchCode: branch.branchCode ?? '',
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      email: branch.email ?? '',
      status: branch.status === 'inactive' ? 'inactive' : 'active',
    });
    setFormErrors({});
    setFormVisible(true);
  }, []);

  const validateForm = useCallback((): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Branch name is required.';
    if (!form.branchCode.trim()) {
      next.branchCode = 'Branch code is required.';
    } else if (!BRANCH_CODE_REGEX.test(form.branchCode.trim())) {
      next.branchCode = '2–20 characters: letters, numbers, hyphens, underscores.';
    }
    if (form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    return next;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    const validation = validateForm();
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const payload: BranchCreatePayload = {
        name: form.name.trim(),
        branchCode: form.branchCode.trim().toUpperCase(),
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      };
      if (editing) {
        const update: BranchUpdatePayload = { ...payload, status: form.status };
        if (update.branchCode === editing.branchCode) {
          delete update.branchCode;
        }
        await updateBranch(editing._id, update);
        Alert.alert('Branch updated');
      } else {
        await createBranch(payload);
        Alert.alert('Branch created');
      }
      setFormVisible(false);
      load('initial');
    } catch (err) {
      Alert.alert('Error', messageFrom(err, 'Something went wrong. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [validateForm, form, editing, load]);

  const confirmStatusToggle = useCallback(
    (branch: BranchItem) => {
      const target = branch.status === 'active' ? 'inactive' : 'active';
      Alert.alert(
        target === 'inactive' ? 'Deactivate branch' : 'Activate branch',
        `Set "${branch.name}" to ${target}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: target === 'inactive' ? 'Deactivate' : 'Activate',
            style: target === 'inactive' ? 'destructive' : 'default',
            onPress: async () => {
              try {
                await updateBranch(branch._id, { status: target });
                load('initial');
              } catch (err) {
                Alert.alert('Error', messageFrom(err, 'Failed to update status. Please try again.'));
              }
            },
          },
        ]
      );
    },
    [load]
  );

  const confirmDelete = useCallback(
    (branch: BranchItem) => {
      Alert.alert(
        'Delete branch',
        'Delete this branch? Branches with members or staff must be deactivated instead.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteBranch(branch._id);
                Alert.alert('Branch deleted');
                load('initial');
              } catch (err) {
                Alert.alert('Error', messageFrom(err, 'Failed to delete branch. Please try again.'));
              }
            },
          },
        ]
      );
    },
    [load]
  );

  const clearError = (field: string) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Branches"
        subtitle="Manage locations and branch operations."
        right={
          <TouchableOpacity style={styles.addButton} onPress={openCreate} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>+ Add Branch</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading branches…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => load('initial')} activeOpacity={0.8}>
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
          {branches.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No branches available.</Text>
            </View>
          ) : (
            branches.map((branch) => (
              <View key={branch._id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardName}>{branch.name}</Text>
                    <Text style={styles.cardCode}>{branch.branchCode}</Text>
                  </View>
                  <StatusBadge status={branch.status} />
                </View>
                <Text style={styles.cardMeta}>
                  {branch.address?.trim() ? branch.address : 'No address provided'}
                </Text>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionPrimary]}
                    onPress={() =>
                      navigation.navigate('BranchDetails', { branchId: branch._id })
                    }
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionPrimaryText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEdit(branch)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => confirmStatusToggle(branch)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionText}>
                      {branch.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => confirmDelete(branch)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionDangerText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFormVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Branch' : 'Add Branch'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} hitSlop={10}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <FormField label="Branch Name *" error={formErrors.name}>
                <TextInput
                  style={[styles.input, formErrors.name && styles.inputError]}
                  value={form.name}
                  onChangeText={(t) => {
                    setForm((f) => ({ ...f, name: t }));
                    clearError('name');
                  }}
                  placeholder="e.g. A1 Fitness Main"
                  placeholderTextColor={colors.textFaint}
                  editable={!submitting}
                />
              </FormField>

              <FormField
                label={editing ? 'Branch Code (editable)' : 'Branch Code *'}
                error={formErrors.branchCode}
              >
                <TextInput
                  style={[styles.input, formErrors.branchCode && styles.inputError]}
                  value={form.branchCode}
                  onChangeText={(t) => {
                    setForm((f) => ({ ...f, branchCode: t.toUpperCase() }));
                    clearError('branchCode');
                  }}
                  placeholder="e.g. MAIN"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!submitting}
                />
              </FormField>

              <FormField label="Address">
                <TextInput
                  style={styles.input}
                  value={form.address}
                  onChangeText={(t) => setForm((f) => ({ ...f, address: t }))}
                  placeholder="Branch address"
                  placeholderTextColor={colors.textFaint}
                  editable={!submitting}
                />
              </FormField>

              <FormField label="Phone">
                <TextInput
                  style={styles.input}
                  value={form.phone}
                  onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))}
                  placeholder="Phone number"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="phone-pad"
                  editable={!submitting}
                />
              </FormField>

              <FormField label="Email" error={formErrors.email}>
                <TextInput
                  style={[styles.input, formErrors.email && styles.inputError]}
                  value={form.email}
                  onChangeText={(t) => {
                    setForm((f) => ({ ...f, email: t }));
                    clearError('email');
                  }}
                  placeholder="branch@example.com"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!submitting}
                />
              </FormField>

              {editing && (
                <FormField label="Status">
                  <View style={styles.statusRow}>
                    {(['active', 'inactive'] as const).map((s) => {
                      const selected = form.status === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          style={[styles.statusChip, selected && styles.statusChipSelected]}
                          onPress={() => setForm((f) => ({ ...f, status: s }))}
                          disabled={submitting}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.statusChipText,
                              selected && styles.statusChipTextSelected,
                            ]}
                          >
                            {s}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </FormField>
              )}

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editing ? 'Save Changes' : 'Create Branch'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0b10',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
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
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textFaint,
    fontSize: 15,
  },
  card: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardHead: {
    flex: 1,
    marginRight: 12,
  },
  cardName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardCode: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionPrimary: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderColor: colors.accent,
  },
  actionPrimaryText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  actionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  actionDangerText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#13161d',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  modalClose: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
    padding: 4,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusChip: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  statusChipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusChipTextSelected: {
    color: colors.accent,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});