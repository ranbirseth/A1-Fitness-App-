import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import {
  type PlanItem,
  type PlanCreatePayload,
  type PlanUpdatePayload,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  applyPlanToBranch,
  removePlanFromBranch,
  getPlanBranches,
} from '../api/plans';
import { type BranchItem, getBranches } from '../api/branches';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useDrawer } from '../components/drawer/DrawerContext';

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

interface PlanFormValues {
  name: string;
  price: string;
  duration: string;
  features: string[];
  featureInput: string;
}

function blankPlanForm(): PlanFormValues {
  return { name: '', price: '', duration: '30', features: [], featureInput: '' };
}

function planToForm(plan: PlanItem): PlanFormValues {
  return {
    name: plan.name,
    price: String(plan.price),
    duration: String(plan.duration),
    features: [...plan.features],
    featureInput: '',
  };
}

function formatPrice(price: number): string {
  return price.toLocaleString('en-IN');
}

export function SuperadminPlansScreen() {
  const insets = useSafeAreaInsets();
  const { setActive } = useDrawer();

  useEffect(() => {
    setActive('Plans');
  }, [setActive]);

  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plan form (create/edit)
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [form, setForm] = useState<PlanFormValues>(blankPlanForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Apply-to-branch modal
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  const [branchModalPlan, setBranchModalPlan] = useState<PlanItem | null>(null);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [applyingBranch, setApplyingBranch] = useState<string | null>(null);

  // View branches modal
  const [viewBranchesVisible, setViewBranchesVisible] = useState(false);
  const [viewBranchesPlan, setViewBranchesPlan] = useState<PlanItem | null>(null);
  const [planBranches, setPlanBranches] = useState<{ branchCode: string; status: string }[]>([]);
  const [planBranchesLoading, setPlanBranchesLoading] = useState(false);
  const [removingBranch, setRemovingBranch] = useState<string | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const page = await listPlans();
      setPlans(page.items);
    } catch (err) {
      setError(messageFrom(err, 'Failed to load plans. Please try again.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load('initial');
  }, [load]);

  // ── Plan form (create / edit) ────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(blankPlanForm());
    setFormErrors({});
    setFormVisible(true);
  }, []);

  const openEdit = useCallback((plan: PlanItem) => {
    setEditing(plan);
    setForm(planToForm(plan));
    setFormErrors({});
    setFormVisible(true);
  }, []);

  const validateForm = useCallback((): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Plan name is required.';
    const price = Number(form.price);
    if (form.price.trim() === '' || isNaN(price)) {
      next.price = 'Price is required.';
    } else if (price < 0) {
      next.price = 'Price cannot be negative.';
    }
    const duration = Number(form.duration);
    if (form.duration.trim() === '' || isNaN(duration)) {
      next.duration = 'Duration is required.';
    } else if (duration < 1 || !Number.isInteger(duration)) {
      next.duration = 'Duration must be at least 1 day.';
    }
    return next;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    const validation = validateForm();
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const features = form.features.filter((f) => f.trim());
      const payload: PlanCreatePayload = {
        name: form.name.trim(),
        price: Number(form.price),
        duration: Number(form.duration),
        features,
      };

      if (editing) {
        const updatePayload: PlanUpdatePayload = {
          name: payload.name,
          price: payload.price,
          duration: payload.duration,
          features: payload.features,
        };
        await updatePlan(editing._id, updatePayload);
        Alert.alert('Plan updated');
      } else {
        await createPlan(payload);
        Alert.alert('Plan created');
      }
      setFormVisible(false);
      load('initial');
    } catch (err) {
      Alert.alert('Error', messageFrom(err, 'Something went wrong. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [validateForm, form, editing, load]);

  const addFeature = useCallback(() => {
    const trimmed = form.featureInput.trim();
    if (!trimmed) return;
    if (form.features.includes(trimmed)) return;
    setForm((prev) => ({
      ...prev,
      features: [...prev.features, trimmed],
      featureInput: '',
    }));
  }, [form.featureInput, form.features]);

  const removeFeature = useCallback((idx: number) => {
    setForm((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== idx),
    }));
  }, []);

  const clearError = useCallback((field: string) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // ── Delete plan ──────────────────────────────────────────────────────────

  const confirmDelete = useCallback(
    (plan: PlanItem) => {
      Alert.alert(
        'Delete plan',
        `Delete "${plan.name}"?\n\nThis will also remove all branch assignments. Cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deletePlan(plan._id);
                Alert.alert('Plan deleted');
                load('initial');
              } catch (err) {
                Alert.alert('Error', messageFrom(err, 'Failed to delete plan.'));
              }
            },
          },
        ],
      );
    },
    [load],
  );

  // ── Apply to branch ──────────────────────────────────────────────────────

  const openBranchModal = useCallback(async (plan: PlanItem) => {
    setBranchModalPlan(plan);
    setBranchModalVisible(true);
    setBranchesLoading(true);
    try {
      const items = await getBranches();
      setBranches(items.filter((b) => b.status === 'active'));
    } catch {
      Alert.alert('Error', 'Failed to load branches.');
      setBranchModalVisible(false);
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  const handleApply = useCallback(
    async (branchCode: string) => {
      if (!branchModalPlan) return;
      setApplyingBranch(branchCode);
      try {
        await applyPlanToBranch(branchModalPlan._id, branchCode);
        Alert.alert('Applied', `Plan applied to ${branchCode}.`);
        setBranchModalVisible(false);
        load('initial');
      } catch (err) {
        Alert.alert('Error', messageFrom(err, 'Failed to apply plan to branch.'));
      } finally {
        setApplyingBranch(null);
      }
    },
    [branchModalPlan, load],
  );

  const appliedSet = useMemo(() => {
    return new Set(branchModalPlan?.appliedBranches ?? []);
  }, [branchModalPlan]);

  // ── View applied branches ────────────────────────────────────────────────

  const openViewBranches = useCallback(async (plan: PlanItem) => {
    setViewBranchesPlan(plan);
    setViewBranchesVisible(true);
    setPlanBranchesLoading(true);
    try {
      const branchesData = await getPlanBranches(plan._id);
      setPlanBranches(branchesData.map((b) => ({ branchCode: b.branchCode, status: b.status })));
    } catch {
      // fallback to appliedBranches from the plan itself
      setPlanBranches(plan.appliedBranches.map((bc) => ({ branchCode: bc, status: 'active' })));
    } finally {
      setPlanBranchesLoading(false);
    }
  }, []);

  const confirmRemoveBranch = useCallback(
    (planId: string, branchCode: string) => {
      Alert.alert(
        'Remove from branch',
        `Remove this plan from ${branchCode}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setRemovingBranch(branchCode);
              try {
                await removePlanFromBranch(planId, branchCode);
                Alert.alert('Removed', `Plan removed from ${branchCode}.`);
                // refresh the branches list in the modal
                const updated = await getPlanBranches(planId);
                setPlanBranches(updated.map((b) => ({ branchCode: b.branchCode, status: b.status })));
                load('initial');
              } catch (err) {
                Alert.alert('Error', messageFrom(err, 'Failed to remove plan from branch.'));
              } finally {
                setRemovingBranch(null);
              }
            },
          },
        ],
      );
    },
    [load],
  );

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderPlanCard = useCallback(
    ({ item: plan }: { item: PlanItem }) => {
      const branchCount = plan.appliedBranches?.length ?? 0;
      const featureCount = plan.features?.length ?? 0;

      return (
        <View style={styles.card}>
          {/* Top row: name + price */}
          <View style={styles.cardTop}>
            <View style={styles.cardTopLeft}>
              <Text style={styles.cardName} numberOfLines={1}>{plan.name}</Text>
              <Text style={styles.cardDuration}>{plan.duration} days</Text>
            </View>
            <Text style={styles.cardPrice}>{'\u20B9'}{formatPrice(plan.price)}</Text>
          </View>

          {/* Features */}
          {featureCount > 0 ? (
            <View style={styles.featuresSection}>
              {plan.features.slice(0, 3).map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Text style={styles.featureBullet}>{'\u2713'}</Text>
                  <Text style={styles.featureText} numberOfLines={1}>{f}</Text>
                </View>
              ))}
              {featureCount > 3 && (
                <Text style={styles.featureMore}>+{featureCount - 3} more</Text>
              )}
            </View>
          ) : (
            <Text style={styles.noFeatures}>No features listed</Text>
          )}

          {/* Branches */}
          <TouchableOpacity
            style={styles.branchSection}
            onPress={() => openViewBranches(plan)}
            activeOpacity={0.7}
          >
            <Text style={styles.branchLabel}>Available in {branchCount} branch{branchCount !== 1 ? 'es' : ''}</Text>
            {branchCount > 0 ? (
              <View style={styles.branchChips}>
                {plan.appliedBranches.slice(0, 3).map((bc) => (
                  <View key={bc} style={styles.branchChip}>
                    <Text style={styles.branchChipText}>{bc}</Text>
                  </View>
                ))}
                {branchCount > 3 && (
                  <Text style={styles.branchMore}>+{branchCount - 3}</Text>
                )}
              </View>
            ) : (
              <Text style={styles.noBranches}>Not applied to any branch</Text>
            )}
          </TouchableOpacity>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionPrimary}
              onPress={() => openBranchModal(plan)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionPrimaryText}>Apply to Branch</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => openEdit(plan)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => confirmDelete(plan)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionDangerText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [openBranchModal, openEdit, openViewBranches, confirmDelete],
  );

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Plans"
        subtitle="Create and manage membership plans."
        right={
          <TouchableOpacity style={styles.addButton} onPress={openCreate} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>+ Add Plan</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading plans...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>{'\u26A0'}</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => load('initial')} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item) => item._id}
          renderItem={renderPlanCard}
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
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>{'\u26A1'}</Text>
              <Text style={styles.emptyTitle}>No plans created yet</Text>
              <Text style={styles.emptySubtitle}>
                Plans must be created before they can be applied to branches.
              </Text>
              <TouchableOpacity style={styles.emptyButton} onPress={openCreate} activeOpacity={0.8}>
                <Text style={styles.emptyButtonText}>Add First Plan</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* ── Create / Edit Modal ── */}
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
              <Text style={styles.modalTitle}>{editing ? 'Edit Plan' : 'Add Plan'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} hitSlop={10}>
                <Text style={styles.modalClose}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalScrollArea}>
              <FormField label="Plan Name *" error={formErrors.name}>
                <TextInput
                  style={[styles.input, formErrors.name && styles.inputError]}
                  value={form.name}
                  onChangeText={(t) => {
                    setForm((f) => ({ ...f, name: t }));
                    clearError('name');
                  }}
                  placeholder="e.g. Premium Monthly"
                  placeholderTextColor={colors.textFaint}
                  editable={!submitting}
                />
              </FormField>

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <FormField label="Price (\u20B9) *" error={formErrors.price}>
                    <TextInput
                      style={[styles.input, formErrors.price && styles.inputError]}
                      value={form.price}
                      onChangeText={(t) => {
                        setForm((f) => ({ ...f, price: t.replace(/[^0-9.]/g, '') }));
                        clearError('price');
                      }}
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      editable={!submitting}
                    />
                  </FormField>
                </View>
                <View style={styles.halfField}>
                  <FormField label="Duration (days) *" error={formErrors.duration}>
                    <TextInput
                      style={[styles.input, formErrors.duration && styles.inputError]}
                      value={form.duration}
                      onChangeText={(t) => {
                        setForm((f) => ({ ...f, duration: t.replace(/[^0-9]/g, '') }));
                        clearError('duration');
                      }}
                      placeholder="30"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      editable={!submitting}
                    />
                  </FormField>
                </View>
              </View>

              <FormField label="Features">
                <View style={styles.featureInputRow}>
                  <TextInput
                    style={[styles.input, styles.featureInput]}
                    value={form.featureInput}
                    onChangeText={(t) => setForm((f) => ({ ...f, featureInput: t }))}
                    placeholder="Add a feature"
                    placeholderTextColor={colors.textFaint}
                    onSubmitEditing={addFeature}
                    returnKeyType="done"
                    editable={!submitting}
                  />
                  <TouchableOpacity style={styles.featureAddButton} onPress={addFeature} activeOpacity={0.7}>
                    <Text style={styles.featureAddText}>+</Text>
                  </TouchableOpacity>
                </View>
                {form.features.length > 0 && (
                  <View style={styles.featureTags}>
                    {form.features.map((feature, idx) => (
                      <View key={`${feature}-${idx}`} style={styles.featureTag}>
                        <Text style={styles.featureTagText}>{feature}</Text>
                        <TouchableOpacity onPress={() => removeFeature(idx)} hitSlop={6} activeOpacity={0.6}>
                          <Text style={styles.featureTagRemove}>{'\u2715'}</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </FormField>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setFormVisible(false)}
                disabled={submitting}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
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
                    {editing ? 'Save Changes' : 'Create Plan'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Apply to Branch Modal ── */}
      <Modal
        visible={branchModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBranchModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply "{branchModalPlan?.name}"</Text>
              <TouchableOpacity onPress={() => setBranchModalVisible(false)} hitSlop={10}>
                <Text style={styles.modalClose}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalScrollArea}>
              {branchesLoading ? (
                <View style={styles.branchesLoading}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.stateText}>Loading branches...</Text>
                </View>
              ) : branches.length === 0 ? (
                <Text style={styles.emptyBranchText}>No active branches found.</Text>
              ) : (
                branches.map((branch) => {
                  const alreadyApplied = appliedSet.has(branch.branchCode);
                  const isApplying = applyingBranch === branch.branchCode;
                  return (
                    <View key={branch._id} style={styles.branchRow}>
                      <View style={styles.branchRowInfo}>
                        <Text style={styles.branchRowName}>{branch.name}</Text>
                        <Text style={styles.branchRowCode}>{branch.branchCode}</Text>
                      </View>
                      {alreadyApplied ? (
                        <View style={styles.branchAppliedBadge}>
                          <Text style={styles.branchAppliedText}>Applied</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.branchApplyButton, isApplying && styles.branchApplyButtonDisabled]}
                          onPress={() => handleApply(branch.branchCode)}
                          disabled={isApplying}
                          activeOpacity={0.7}
                        >
                          {isApplying ? (
                            <ActivityIndicator size="small" color={colors.text} />
                          ) : (
                            <Text style={styles.branchApplyText}>Apply</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── View Applied Branches Modal ── */}
      <Modal
        visible={viewBranchesVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setViewBranchesVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>"{viewBranchesPlan?.name}" branches</Text>
              <TouchableOpacity onPress={() => setViewBranchesVisible(false)} hitSlop={10}>
                <Text style={styles.modalClose}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalScrollArea}>
              {planBranchesLoading ? (
                <View style={styles.branchesLoading}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : planBranches.length === 0 ? (
                <Text style={styles.emptyBranchText}>This plan is not applied to any branch.</Text>
              ) : (
                planBranches.map((pb) => {
                  const isRemoving = removingBranch === pb.branchCode;
                  return (
                    <View key={pb.branchCode} style={styles.branchRow}>
                      <View style={styles.branchRowInfo}>
                        <Text style={styles.branchRowName}>{pb.branchCode}</Text>
                        <Text style={[
                          styles.branchRowStatus,
                          pb.status === 'active' ? styles.branchStatusActive : styles.branchStatusInactive
                        ]}>
                          {pb.status}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.branchRemoveButton, isRemoving && styles.branchRemoveButtonDisabled]}
                        onPress={() => viewBranchesPlan && confirmRemoveBranch(viewBranchesPlan._id, pb.branchCode)}
                        disabled={isRemoving}
                        activeOpacity={0.7}
                      >
                        {isRemoving ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <Text style={styles.branchRemoveText}>Remove</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── FormField helper ────────────────────────────────────────────────────────

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
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0b10',
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },

  // Card
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
    marginBottom: 10,
  },
  cardTopLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  cardDuration: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  cardPrice: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '800',
  },

  // Features
  featuresSection: {
    marginBottom: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  featureBullet: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
    width: 18,
  },
  featureText: {
    color: colors.textMuted,
    fontSize: 13,
    flex: 1,
  },
  featureMore: {
    color: colors.textFaint,
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 18,
    marginTop: 2,
  },
  noFeatures: {
    color: colors.textFaint,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 10,
  },

  // Branches
  branchSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
    marginBottom: 12,
  },
  branchLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  branchChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  branchChip: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  branchChipText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  branchMore: {
    color: colors.textFaint,
    fontSize: 12,
    alignSelf: 'center',
  },
  noBranches: {
    color: colors.textFaint,
    fontSize: 13,
    fontStyle: 'italic',
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 12,
  },
  actionPrimary: {
    flex: 1,
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionPrimaryText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  actionButton: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
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

  // Modal
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
    flex: 1,
    marginRight: 12,
  },
  modalClose: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
    padding: 4,
  },
  modalScrollArea: {
    maxHeight: '70%',
  },

  // Form fields
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },

  // Feature input
  featureInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  featureInput: {
    flex: 1,
  },
  featureAddButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureAddText: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '700',
  },
  featureTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  featureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  featureTagText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  featureTagRemove: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },

  // Modal actions
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },

  // Branch modal
  branchesLoading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyBranchText: {
    color: colors.textFaint,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  branchRowInfo: {
    flex: 1,
    marginRight: 12,
  },
  branchRowName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  branchRowCode: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  branchRowStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  branchStatusActive: {
    color: colors.success,
  },
  branchStatusInactive: {
    color: colors.textFaint,
  },
  branchAppliedBadge: {
    backgroundColor: 'rgba(46,184,114,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  branchAppliedText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
  },
  branchApplyButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  branchApplyButtonDisabled: {
    opacity: 0.5,
  },
  branchApplyText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  branchRemoveButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  branchRemoveButtonDisabled: {
    opacity: 0.5,
  },
  branchRemoveText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
});
