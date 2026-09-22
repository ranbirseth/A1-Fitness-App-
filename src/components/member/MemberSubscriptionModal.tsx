import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import { StatusBadge } from '../StatusBadge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type MemberItem,
  type PlanItem,
  assignPlan,
  cancelPlan,
  getPlans,
  renewPlan,
} from '../../api/members';
import { generateIdempotencyKey } from '../../api/idempotency';
import { ApiError } from '../../api/client';

function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  return err instanceof Error && err.message ? err.message : fallback;
}

function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN');
}

type Action = 'assign' | 'renew' | 'cancel';

const PAYMENT_METHODS = ['cash', 'card', 'upi', 'online'] as const;

interface Props {
  visible: boolean;
  onClose: () => void;
  member: MemberItem | null;
  onDone: (message: string) => void;
  /** Branch scope for loading plans. If omitted, loads all plans. */
  branchCode?: string;
}

export function MemberSubscriptionModal({ visible, onClose, member, onDone, branchCode }: Props) {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [markAsPaid, setMarkAsPaid] = useState(true);
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);

  // Double-submit guard: a ref is checked synchronously so a second tap cannot
  // enter the handler before the first request completes, even if React state
  // has not re-rendered yet.
  const submittingRef = useRef(false);
  // Stable idempotencyKey for the CURRENT operation. Generated once when the
  // operation starts and cleared when it completes, so retries of the same
  // operation reuse the key but a brand-new operation gets a new one.
  const operationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !member) return;
    setBusy(null);
    submittingRef.current = false;
    operationKeyRef.current = null;
    setNote('');
    setMarkAsPaid(true);
    setAmountTouched(false);
    setSelectedPlanId(member.currentPlan?._id ?? '');
    const currentPrice = member.currentPlan?.price ?? 0;
    setAmountText(currentPrice > 0 ? String(currentPrice) : '');
    setLoadingPlans(true);
    getPlans(branchCode)
      .then((items) => {
        setPlans(items);
        const autoId = member.currentPlan?._id;
        if (!autoId && items.length === 1) {
          setSelectedPlanId(items[0]._id);
          const price = items[0].price;
          setAmountText(price > 0 ? String(price) : '');
        }
      })
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }, [visible, member, branchCode]);

  const selectPlan = useCallback(
    (planId: string) => {
      setSelectedPlanId(planId);
      if (!amountTouched) {
        const plan = plans.find((p) => p._id === planId);
        setAmountText(plan && plan.price > 0 ? String(plan.price) : '');
      }
    },
    [plans, amountTouched]
  );

  if (!member) return null;

  const parsedAmount = Number(amountText) || 0;

  const runAction = async (action: Action) => {
    if (submittingRef.current || busy) return;
    if (action === 'assign' && !selectedPlanId) {
      Alert.alert('Select a plan first', 'Choose a plan before assigning.');
      return;
    }

    // Generate ONE stable idempotencyKey for this logical operation. It is
    // retained in a ref so any retry of the SAME operation reuses it, and is
    // cleared when the operation completes so a fresh operation gets a new key.
    const payStatus: 'paid' | 'pending' = markAsPaid ? 'paid' : 'pending';
    const payment = {
      amount: parsedAmount,
      method,
      status: payStatus,
      note: note.trim() || undefined,
      idempotencyKey: operationKeyRef.current ?? generateIdempotencyKey(),
    };

    submittingRef.current = true;
    setBusy(action);
    try {
      let message = '';
      switch (action) {
        case 'assign':
          await assignPlan(member._id, {
            planId: selectedPlanId,
            payment,
          });
          message = 'Plan assigned.';
          break;
        case 'renew': {
          const renewBody: { planId?: string; payment?: typeof payment } = { payment };
          if (selectedPlanId) renewBody.planId = selectedPlanId;
          await renewPlan(member._id, renewBody);
          message = 'Plan renewed.';
          break;
        }
        case 'cancel':
          await cancelPlan(member._id);
          message = 'Membership cancelled.';
          break;
      }
      onDone(message);
      onClose();
    } catch (err) {
      Alert.alert('Error', messageFrom(err, 'Something went wrong. Please try again.'));
    } finally {
      submittingRef.current = false;
      operationKeyRef.current = null;
      setBusy(null);
    }
  };

  const confirmCancel = () => {
    Alert.alert('Cancel membership', 'Cancel this member\'s current plan?', [
      { text: 'No', style: 'cancel' },
      { text: 'Cancel Plan', style: 'destructive', onPress: () => runAction('cancel') },
    ]);
  };

  const countDown = member.remainingDays;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 28) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Subscription</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryName}>{member.user?.name || 'Member'}</Text>
              <View style={styles.summaryRow}>
                <StatusBadge status={member.status} />
                <StatusBadge status={member.paymentStatus} />
              </View>
              <Text style={styles.summaryLine}>Branch: {member.branchCode}</Text>
              <Text style={styles.summaryLine}>
                Plan: {member.currentPlan?.name || 'No plan'}
              </Text>
              <Text style={styles.summaryLine}>
                Expiry:{' '}
                {member.membershipExpiryDate
                  ? new Date(member.membershipExpiryDate).toLocaleDateString('en-IN')
                  : '-'}
              </Text>
              {member.status === 'frozen' && countDown != null && (
                <Text style={styles.summaryWarn}>
                  Frozen — {countDown} days remaining (resume to restore).
                </Text>
              )}
            </View>

            <Text style={styles.label}>Plan *</Text>
            {loadingPlans ? (
              <ActivityIndicator color={colors.accent} style={styles.loadingInline} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsContainer}
              >
                {plans.length === 0 ? (
                  <Text style={styles.hint}>No plans available.</Text>
                ) : (
                  plans.map((p) => {
                    const selected = selectedPlanId === p._id;
                    return (
                      <TouchableOpacity
                        key={p._id}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => selectPlan(p._id)}
                        disabled={busy !== null}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {p.name} · {formatINR(p.price)} · {p.duration}d
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Amount</Text>
              <TextInput
                style={styles.input}
                value={amountText}
                onChangeText={(t) => {
                  setAmountTouched(true);
                  setAmountText(t.replace(/[^0-9]/g, ''));
                }}
                placeholder="0"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                editable={busy === null}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Method</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsContainer}
              >
                {PAYMENT_METHODS.map((m) => {
                  const selected = method === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setMethod(m)}
                      disabled={busy !== null}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.label}>Mark as Paid</Text>
              <Switch
                value={markAsPaid}
                onValueChange={setMarkAsPaid}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
                disabled={busy !== null}
              />
            </View>
            {!markAsPaid && (
              <Text style={styles.hint}>
                Assigning/renewing/upgrading keeps the payment pending. You can
                record it later in the Payments module.
              </Text>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Note</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={note}
                onChangeText={setNote}
                placeholder="Optional note"
                placeholderTextColor={colors.textFaint}
                multiline
                editable={busy === null}
              />
            </View>

            <Text style={styles.actionsLabel}>Actions</Text>
            <View style={styles.actionsRow}>
              <ActionButton
                label="Assign"
                disabled={busy !== null}
                busy={busy === 'assign'}
                onPress={() => runAction('assign')}
              />
              <ActionButton
                label="Renew"
                disabled={busy !== null}
                busy={busy === 'renew'}
                onPress={() => runAction('renew')}
              />
              <ActionButton
                label="Cancel"
                danger
                disabled={busy !== null}
                busy={busy === 'cancel'}
                onPress={confirmCancel}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  busy,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        danger && styles.actionButtonDanger,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <Text style={[styles.actionButtonText, danger && styles.actionButtonTextDanger]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '92%',
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
  summaryCard: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  summaryName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  summaryLine: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  summaryWarn: {
    color: '#f59e0b',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 4,
  },
  field: {
    marginBottom: 14,
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
  multiline: {
    height: 70,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  chipsContainer: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.accent,
    fontWeight: '700',
  },
  loadingInline: {
    alignSelf: 'flex-start',
    marginVertical: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionsLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    height: 46,
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDanger: {
    backgroundColor: 'rgba(229,72,77,0.14)',
    borderColor: colors.danger,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionButtonText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  actionButtonTextDanger: {
    color: colors.danger,
  },
});