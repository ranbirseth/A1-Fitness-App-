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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import {
  type AdminCreatePayload,
  type AdminItem,
  type AdminUpdatePayload,
  createAdmin,
  deleteAdmin,
  getAdmins,
  updateAdmin,
} from '../api/admins';
import { type BranchItem, getBranches } from '../api/branches';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useDrawer } from '../components/drawer/DrawerContext';
import { StatusBadge } from '../components/StatusBadge';

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AdminFormValues {
  name: string;
  email: string;
  phone: string;
  branchCode: string;
  password: string;
  status: 'active' | 'inactive';
}

function blankForm(): AdminFormValues {
  return {
    name: '',
    email: '',
    phone: '',
    branchCode: '',
    password: '',
    status: 'active',
  };
}

export function SuperadminAdminsScreen() {
  const insets = useSafeAreaInsets();
  const { setActive } = useDrawer();

  useEffect(() => {
    setActive('Admins');
  }, [setActive]);

  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<AdminItem | null>(null);
  const [form, setForm] = useState<AdminFormValues>(blankForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [branches, setBranches] = useState<BranchItem[]>([]);
  const activeBranches = branches.filter((b) => b.status === 'active');

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const items = await getAdmins();
      setAdmins(items);
      const br = await getBranches();
      setBranches(br);
    } catch (err) {
      setError(messageFrom(err, 'Failed to load admins. Please try again.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load('initial');
  }, [load]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Filter locally; server search is name-only, but client-side filter covers all
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const filtered = searchQuery.trim()
    ? admins.filter((a) => {
        const q = searchQuery.toLowerCase();
        return (
          a.name?.toLowerCase().includes(q) ||
          a.email?.toLowerCase().includes(q)
        );
      })
    : admins;

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(blankForm());
    setFormErrors({});
    setFormVisible(true);
  }, []);

  const openEdit = useCallback(
    (admin: AdminItem) => {
      setEditing(admin);
      setForm({
        name: admin.name ?? '',
        email: admin.email ?? '',
        phone: admin.phone ?? '',
        branchCode: admin.branchCode ?? '',
        password: '',
        status: admin.status === 'inactive' ? 'inactive' : 'active',
      });
      setFormErrors({});
      setFormVisible(true);
    },
    []
  );

  const validateForm = useCallback((): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Full name is required.';
    if (!form.email.trim()) {
      next.email = 'Email is required.';
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!form.branchCode.trim()) {
      next.branchCode = 'Select a branch to assign.';
    } else {
      const selected = branches.find((b) => b.branchCode === form.branchCode);
      if (selected && selected.status === 'inactive') {
        next.branchCode = 'Cannot assign to an inactive branch.';
      }
    }
    if (!editing && !form.password.trim()) {
      next.password = 'A temporary password is required.';
    }
    return next;
  }, [form, editing, branches]);

  const handleSubmit = useCallback(async () => {
    const validation = validateForm();
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      if (editing) {
        const payload: AdminUpdatePayload = {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          branchCode: form.branchCode.trim().toUpperCase(),
          status: form.status,
        };
        if (form.password.trim()) payload.password = form.password.trim();
        await updateAdmin(editing._id, payload);
        Alert.alert('Admin updated');
      } else {
        const payload: AdminCreatePayload = {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          branchCode: form.branchCode.trim().toUpperCase(),
          password: form.password.trim() || 'Password123',
        };
        await createAdmin(payload);
        Alert.alert('Admin created');
      }
      setFormVisible(false);
      load('initial');
    } catch (err) {
      Alert.alert('Error', messageFrom(err, 'Something went wrong. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [validateForm, form, editing, load]);

  const confirmDelete = useCallback(
    (admin: AdminItem) => {
      Alert.alert('Delete admin', `Delete ${admin.name}? This action cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAdmin(admin._id);
              Alert.alert('Admin deleted');
              load('initial');
            } catch (err) {
              Alert.alert('Error', messageFrom(err, 'Failed to delete admin. Please try again.'));
            }
          },
        },
      ]);
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

  const findBranchLabel = (code: string): string => {
    const b = branches.find((br) => br.branchCode === code);
    return b ? b.name : code;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Branch Admins"
        subtitle="Manage branch administrator accounts and their branch assignments."
        right={
          <TouchableOpacity style={styles.addButton} onPress={openCreate} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>+ Add Admin</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name or email…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading admins…</Text>
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
          {filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                {searchQuery.trim() ? 'No admins match your search.' : 'No admins available.'}
              </Text>
            </View>
          ) : (
            filtered.map((admin) => (
              <View key={admin._id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardName}>{admin.name}</Text>
                    <View style={styles.labelBadge}>
                      <Text style={styles.labelBadgeText}>Branch Administrator</Text>
                    </View>
                  </View>
                  <StatusBadge status={admin.status} />
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Branch</Text>
                  <Text style={styles.detailValue}>
                    {findBranchLabel(admin.branchCode)} ({admin.branchCode})
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Email</Text>
                  <Text style={styles.detailValue}>{admin.email || '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone</Text>
                  <Text style={styles.detailValue}>{admin.phone || '-'}</Text>
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEdit(admin)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => confirmDelete(admin)}
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
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 28) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Admin' : 'Add Admin'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} hitSlop={10}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <FormField label="Full Name *" error={formErrors.name}>
                <TextInput
                  style={[styles.input, formErrors.name && styles.inputError]}
                  value={form.name}
                  onChangeText={(t) => {
                    setForm((f) => ({ ...f, name: t }));
                    clearError('name');
                  }}
                  placeholder="Admin name"
                  placeholderTextColor={colors.textFaint}
                  editable={!submitting}
                />
              </FormField>

              <FormField label="Email Address *" error={formErrors.email}>
                <TextInput
                  style={[styles.input, formErrors.email && styles.inputError]}
                  value={form.email}
                  onChangeText={(t) => {
                    setForm((f) => ({ ...f, email: t }));
                    clearError('email');
                  }}
                  placeholder="admin@example.com"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!submitting}
                />
              </FormField>

              <FormField label="Phone Number">
                <TextInput
                  style={styles.input}
                  value={form.phone}
                  onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))}
                  placeholder="Phone number (optional)"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="phone-pad"
                  editable={!submitting}
                />
              </FormField>

              <FormField label="Assigned Branch *" error={formErrors.branchCode}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.branchChipsContainer}
                >
                  {(activeBranches.length > 0 ? activeBranches : branches).map((b) => {
                    const selected = form.branchCode === b.branchCode;
                    return (
                      <TouchableOpacity
                        key={b._id}
                        style={[styles.branchChip, selected && styles.branchChipSelected]}
                        onPress={() => {
                          setForm((f) => ({ ...f, branchCode: b.branchCode }));
                          clearError('branchCode');
                        }}
                        disabled={submitting}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.branchChipText,
                            selected && styles.branchChipTextSelected,
                          ]}
                        >
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </FormField>

              <FormField
                label={editing ? 'Password (leave blank to keep current)' : 'Temporary Password *'}
                error={formErrors.password}
              >
                <TextInput
                  style={[styles.input, formErrors.password && styles.inputError]}
                  value={form.password}
                  onChangeText={(t) => {
                    setForm((f) => ({ ...f, password: t }));
                    clearError('password');
                  }}
                  placeholder={editing ? 'New password (optional)' : 'Default: Password123'}
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry
                  autoCapitalize="none"
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
                    {editing ? 'Save Changes' : 'Create Admin'}
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
    marginBottom: 12,
  },
  cardHead: {
    flex: 1,
    marginRight: 12,
  },
  cardName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  labelBadge: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  labelBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
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
    marginTop: 12,
  },
  actionButton: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  branchChipsContainer: {
    gap: 8,
    paddingVertical: 4,
  },
  branchChip: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  branchChipSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  branchChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  branchChipTextSelected: {
    color: colors.accent,
    fontWeight: '700',
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