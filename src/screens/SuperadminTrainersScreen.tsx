import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { type TrainerCreatePayload, type TrainerItem, createTrainer, getTrainers } from '../api/trainers';
import { type BranchItem, getBranches } from '../api/branches';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useDrawer } from '../components/drawer/DrawerContext';
import { StatusBadge } from '../components/StatusBadge';

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

interface TrainerFormValues {
  name: string;
  phone: string;
  specialty: string;
  branchCode: string;
}

function blankForm(): TrainerFormValues {
  return { name: '', phone: '', specialty: '', branchCode: '' };
}

export function SuperadminTrainersScreen() {
  const insets = useSafeAreaInsets();
  const { setActive } = useDrawer();

  useEffect(() => {
    setActive('Trainers');
  }, [setActive]);

  const [trainers, setTrainers] = useState<TrainerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');

  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<TrainerFormValues>(blankForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [items, br] = await Promise.all([getTrainers(), getBranches()]);
      setTrainers(items);
      setBranches(br);
    } catch (err) {
      setError(messageFrom(err, 'Failed to load trainers. Please try again.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load('initial');
  }, [load]);

  const findBranchLabel = useCallback(
    (code?: string): string => {
      if (!code) return '-';
      const b = branches.find((br) => br.branchCode === code);
      return b ? b.name : code;
    },
    [branches]
  );

  // Client-side refinement only. Branch scoping is enforced by the server, so
  // this can never widen what a caller is allowed to see.
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trainers.filter((t) => {
      if (branchFilter !== 'ALL' && (t.branchCode ?? '').toUpperCase() !== branchFilter) {
        return false;
      }
      if (!q) return true;
      return (
        t.name?.toLowerCase().includes(q) ||
        t.specialty?.toLowerCase().includes(q) ||
        t.phone?.toLowerCase().includes(q)
      );
    });
  }, [trainers, searchQuery, branchFilter]);

  const openCreate = useCallback(() => {
    setForm(blankForm());
    setFormErrors({});
    setFormVisible(true);
  }, []);

  const clearError = (field: string) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateForm = useCallback((): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Trainer name is required.';
    const phone = form.phone.trim();
    if (!phone) {
      next.phone = 'Phone number is required.';
    } else if (phone.replace(/\D/g, '').length < 10) {
      next.phone = 'Enter a valid phone number.';
    }
    if (!form.specialty.trim()) next.specialty = 'Specialty is required.';
    if (!form.branchCode.trim()) {
      next.branchCode = 'Select a branch to assign.';
    } else {
      const selected = branches.find((b) => b.branchCode === form.branchCode);
      if (selected && selected.status === 'inactive') {
        next.branchCode = 'Cannot assign a trainer to an inactive branch.';
      }
    }
    return next;
  }, [form, branches]);

  const handleSubmit = useCallback(async () => {
    const validation = validateForm();
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const payload: TrainerCreatePayload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        specialty: form.specialty.trim(),
        branchCode: form.branchCode.trim().toUpperCase(),
      };
      await createTrainer(payload);
      setFormVisible(false);
      Alert.alert('Trainer created');
      load('initial');
    } catch (err) {
      Alert.alert('Error', messageFrom(err, 'Failed to create trainer. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [validateForm, form, load]);

  const selectableBranches = branches.filter((b) => b.status === 'active');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Trainers"
        subtitle="Assign trainers to branches and use them when creating members."
        right={
          <TouchableOpacity style={styles.addButton} onPress={openCreate} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, specialty or phone…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChips}
      >
        {[{ branchCode: 'ALL', name: 'All Branches' }, ...selectableBranches].map((b) => {
          const selected = branchFilter === b.branchCode;
          return (
            <TouchableOpacity
              key={b.branchCode}
              style={[styles.filterChip, selected && styles.filterChipSelected]}
              onPress={() => setBranchFilter(b.branchCode)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                {b.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading trainers…</Text>
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
                {searchQuery.trim() || branchFilter !== 'ALL'
                  ? 'No trainers match your filters.'
                  : 'No trainers yet. Add your first trainer.'}
              </Text>
            </View>
          ) : (
            filtered.map((trainer) => (
              <View key={trainer._id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardName}>{trainer.name}</Text>
                    <View style={styles.labelBadge}>
                      <Text style={styles.labelBadgeText}>Trainer</Text>
                    </View>
                  </View>
                  {trainer.status ? <StatusBadge status={trainer.status} /> : null}
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone</Text>
                  <Text style={styles.detailValue}>{trainer.phone || '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Specialty</Text>
                  <Text style={styles.detailValue}>{trainer.specialty || '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Branch</Text>
                  <Text style={styles.detailValue}>
                    {findBranchLabel(trainer.branchCode)} ({trainer.branchCode || '-'})
                  </Text>
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
              <Text style={styles.modalTitle}>Add Trainer</Text>
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
                  placeholder="Trainer name"
                  placeholderTextColor={colors.textFaint}
                  editable={!submitting}
                />
              </FormField>

              <FormField label="Phone Number *" error={formErrors.phone}>
                <TextInput
                  style={[styles.input, formErrors.phone && styles.inputError]}
                  value={form.phone}
                  onChangeText={(t) => {
                    setForm((f) => ({ ...f, phone: t }));
                    clearError('phone');
                  }}
                  placeholder="Phone number"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="phone-pad"
                  editable={!submitting}
                />
              </FormField>

              <FormField label="Specialty *" error={formErrors.specialty}>
                <TextInput
                  style={[styles.input, formErrors.specialty && styles.inputError]}
                  value={form.specialty}
                  onChangeText={(t) => {
                    setForm((f) => ({ ...f, specialty: t }));
                    clearError('specialty');
                  }}
                  placeholder="e.g. Strength Training"
                  placeholderTextColor={colors.textFaint}
                  editable={!submitting}
                />
              </FormField>

              <FormField label="Assigned Branch *" error={formErrors.branchCode}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.branchChipsContainer}
                >
                  {(selectableBranches.length > 0 ? selectableBranches : branches).map((b) => {
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

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>Create Trainer</Text>
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
  filterChips: {
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  filterChip: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterChipSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  filterChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextSelected: {
    color: colors.accent,
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
    width: 72,
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
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
