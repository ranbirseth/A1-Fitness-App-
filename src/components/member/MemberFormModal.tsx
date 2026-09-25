import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { colors } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BranchItem } from '../../api/branches';
import { type TrainerItem, getTrainers } from '../../api/trainers';
import {
  type MemberCreatePayload,
  type MemberItem,
  type MemberUpdatePayload,
  type PlanItem,
  createMember,
  getPlans,
  linkBiometric,
  updateMember,
} from '../../api/members';

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN');
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

// Display format used by the Membership Starting Date field, e.g. "15/09/2026".
function toDDMMYYYY(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function todayDDMMYYYY(): string {
  return toDDMMYYYY(new Date());
}

// Parses "DD/MM/YYYY" into the canonical "YYYY-MM-DD" string expected by the
// membershipStartDate API, or null when it is not a real calendar date (catches
// 30/02, month 13, etc.). Date-only strings avoid the backend shifting the day
// through UTC/local-time conversion.
function toISODate(ddmmyyyy: string): string | null {
  const match = DATE_REGEX.exec(ddmmyyyy.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 2000 || year > 2100) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

interface FormValues {
  name: string;
  email: string;
  phone: string;
  password: string;
  branchCode: string;
  planId: string;
  trainerId: string;
  status: 'active' | 'inactive';
  membershipStartDate: string;
  deviceUserId: string;
}

function blankForm(branchCode = ''): FormValues {
  return {
    name: '',
    email: '',
    phone: '',
    password: '',
    branchCode,
    planId: '',
    trainerId: '',
    status: 'active',
    membershipStartDate: todayDDMMYYYY(),
    deviceUserId: '',
  };
}

// The API returns the member's trainer either fully populated
// ({ _id, name, ... }) or as a bare ObjectId string, depending on the endpoint.
// Extract the id defensively so an existing assignment is never silently lost
// (and therefore never silently cleared on save).
function trainerIdOf(trainer: unknown): string {
  if (!trainer) return '';
  if (typeof trainer === 'string') return trainer.trim();
  if (typeof trainer === 'object') {
    const id = (trainer as { _id?: unknown; id?: unknown })._id
      ?? (trainer as { id?: unknown }).id;
    if (typeof id === 'string') return id.trim();
    if (id && typeof (id as { toString?: () => string }).toString === 'function') {
      return String(id).trim();
    }
  }
  return '';
}

// Label for a trainer that is assigned but missing from the loaded options
// (deleted, inactive-branch, or simply not in the current page of results), so
// the selector can still show what the member is assigned to.
function trainerLabel(trainer: unknown, fallbackId: string): string {
  if (trainer && typeof trainer === 'object') {
    const name = (trainer as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return fallbackId ? `Assigned trainer (${fallbackId})` : 'Assigned trainer';
}

interface Props {
  visible: boolean;
  onClose: () => void;
  editing: MemberItem | null;
  branches: BranchItem[];
  onSaved: (message: string) => void;
  /** Branch scope for loading plans. If omitted, loads all plans. */
  branchCode?: string;
  /** When false, password is not required for new members. Defaults to true. */
  requirePassword?: boolean;
}

export function MemberFormModal({ visible, onClose, editing, branches, onSaved, branchCode, requirePassword = true }: Props) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<FormValues>(blankForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // Trainer id the member already had when the form opened. Used so an untouched
  // assignment is never re-sent (and can never be wiped by accident).
  const initialTrainerIdRef = useRef<string>('');

  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [trainers, setTrainers] = useState<TrainerItem[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const activeBranches = useMemo(
    () => (branches.length > 0 ? branches.filter((b) => b.status === 'active') : branches),
    [branches]
  );

  const loadTrainers = useCallback(async (branchCode: string) => {
    if (!branchCode) {
      setTrainers([]);
      return;
    }
    try {
      const items = await getTrainers(branchCode);
      setTrainers(items);
    } catch {
      setTrainers([]);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setFormErrors({});
    setSubmitting(false);

    if (editing) {
      const existingTrainerId = trainerIdOf(editing.trainer);
      initialTrainerIdRef.current = existingTrainerId;
      setForm({
        name: editing.user?.name ?? '',
        email: editing.user?.email ?? '',
        phone: editing.user?.phone ?? '',
        password: '',
        branchCode: editing.branchCode ?? '',
        planId: editing.currentPlan?._id ?? '',
        trainerId: existingTrainerId,
        status: editing.status === 'inactive' ? 'inactive' : 'active',
        membershipStartDate: editing.membershipStartDate
          ? toDDMMYYYY(new Date(editing.membershipStartDate))
          : todayDDMMYYYY(),
        deviceUserId: editing.biometrics?.deviceUserId ?? '',
      });
      loadTrainers(editing.branchCode ?? '');
    } else {
      initialTrainerIdRef.current = '';
      // A branch admin only ever sees their own branch, so preselect it: their
      // trainers load immediately without an extra tap. `branches` still holds
      // only that branch, so the branch cannot be switched to another one.
      const initialBranch = branchCode?.trim().toUpperCase() ?? '';
      setForm(blankForm(initialBranch));
      loadTrainers(initialBranch);
    }

    setLoadingOptions(true);
    getPlans(branchCode)
      .then(setPlans)
      .catch(() => setPlans([]))
      .finally(() => setLoadingOptions(false));
  }, [visible, editing, loadTrainers, branchCode]);

  const changeField = useCallback((field: keyof FormValues, value: string, errorKey?: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errorKey) {
      setFormErrors((prev) => {
        if (!prev[errorKey]) return prev;
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    }
  }, []);

  const onBranchChange = useCallback(
    (code: string) => {
      changeField('branchCode', code, 'branchCode');
      loadTrainers(code);
      // A trainer from another branch must never stay selected. Drop the
      // selection only when the currently chosen trainer is not part of the
      // newly selected branch's options.
      setForm((f) => {
        if (!f.trainerId) return f;
        const stillValid = trainers.some(
          (t) => t._id === f.trainerId && (t.branchCode ?? '').toUpperCase() === code.toUpperCase()
        );
        return stillValid ? f : { ...f, trainerId: '' };
      });
    },
    [changeField, loadTrainers, trainers]
  );

  const validate = useCallback((): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Full name is required.';
    const email = form.email.trim();
    if (email && !EMAIL_REGEX.test(email)) {
      next.email = 'Enter a valid email address (email is optional).';
    }
    // WhatsApp number is REQUIRED for the business. Phone doubles as the
    // WhatsApp destination on the backend (User.phone -> reminder.service.js).
    if (!form.phone.trim()) {
      next.phone = 'WhatsApp number is required.';
    }
    if (requirePassword && !editing && !form.password.trim()) {
      next.password = 'A password is required.';
    }
    if (!form.branchCode.trim()) {
      next.branchCode = 'Select a branch.';
    }
    if (!editing && !toISODate(form.membershipStartDate)) {
      next.membershipStartDate = 'Enter a valid date in DD/MM/YYYY format.';
    }
    return next;
  }, [form, editing]);

  const handleSubmit = useCallback(async () => {
    const validation = validate();
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      if (editing) {
        const payload: MemberUpdatePayload = {
          name: form.name.trim(),
          phone: form.phone.trim(),
          // Email is optional on the backend schema today (required), so a
          // cleared email keeps the existing value; empty emails are not sent.
          ...(form.email.trim() ? { email: form.email.trim().toLowerCase() } : {}),
          status: form.status,
          branchCode: form.branchCode.trim().toUpperCase(),
        };
        // Only send trainerId when it actually changed. An untouched assignment
        // is left out entirely, so a trainer missing from the loaded options can
        // never be wiped by a save. `null` is sent only when the user explicitly
        // picked "No Trainer".
        if (form.trainerId !== initialTrainerIdRef.current) {
          payload.trainerId = form.trainerId || null;
        }
        if (form.password.trim()) payload.password = form.password.trim();
        await updateMember(editing._id, payload);
        const nextDeviceUserId = form.deviceUserId.trim();
        const currentDeviceUserId = (editing.biometrics?.deviceUserId ?? '').trim();
        if (nextDeviceUserId !== currentDeviceUserId) {
          await linkBiometric(editing._id, nextDeviceUserId);
        }
        onSaved('Member updated');
      } else {
        const payload: MemberCreatePayload = {
          name: form.name.trim(),
          phone: form.phone.trim(),
          password: form.password.trim(),
          ...(form.email.trim() ? { email: form.email.trim().toLowerCase() } : {}),
          branchCode: form.branchCode.trim().toUpperCase(),
          membershipStartDate: toISODate(form.membershipStartDate) ?? undefined,
        };
        if (form.planId) payload.planId = form.planId;
        if (form.trainerId) payload.trainerId = form.trainerId;
        const created = await createMember(payload);
        if (form.deviceUserId.trim()) {
          await linkBiometric(created._id, form.deviceUserId.trim());
        }
        onSaved('Member created');
      }
      onClose();
    } catch (err) {
      Alert.alert('Error', messageFrom(err, 'Something went wrong. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [validate, form, editing, onSaved, onClose]);

  const branchChips = activeBranches.length > 0 ? activeBranches : branches;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 28) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Member' : 'Add Member'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.field}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={[styles.input, formErrors.name && styles.inputError]}
                value={form.name}
                onChangeText={(t) => changeField('name', t, 'name')}
                placeholder="Member name"
                placeholderTextColor={colors.textFaint}
                editable={!submitting}
              />
              {formErrors.name && <Text style={styles.fieldError}>{formErrors.name}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email (optional)</Text>
              <TextInput
                style={[styles.input, formErrors.email && styles.inputError]}
                value={form.email}
                onChangeText={(t) => changeField('email', t, 'email')}
                placeholder="member@example.com"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!submitting}
              />
              {formErrors.email && <Text style={styles.fieldError}>{formErrors.email}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>WhatsApp Number *</Text>
              <TextInput
                style={[styles.input, formErrors.phone && styles.inputError]}
                value={form.phone}
                onChangeText={(t) => changeField('phone', t, 'phone')}
                placeholder="Phone / WhatsApp number"
                placeholderTextColor={colors.textFaint}
                keyboardType="phone-pad"
                autoCapitalize="none"
                editable={!submitting}
              />
              {formErrors.phone && <Text style={styles.fieldError}>{formErrors.phone}</Text>}
              <Text style={styles.hint}>
                Used as the WhatsApp destination for membership reminders.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Biometric Device User ID</Text>
              <TextInput
                style={[styles.input, formErrors.deviceUserId && styles.inputError]}
                value={form.deviceUserId}
                onChangeText={(t) => changeField('deviceUserId', t, 'deviceUserId')}
                placeholder="Enter the matching User ID assigned to this member on the physical eSSL terminal panel (e.g., 1)"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                autoCorrect={false}
                editable={!submitting}
              />
              {formErrors.deviceUserId && (
                <Text style={styles.fieldError}>{formErrors.deviceUserId}</Text>
              )}
              <Text style={styles.hint}>
                Links this member's biometric punches to their terminal user ID.
              </Text>
            </View>

            {!editing && (
              <View style={styles.field}>
                <Text style={styles.label}>Password *</Text>
                <TextInput
                  style={[styles.input, formErrors.password && styles.inputError]}
                  value={form.password}
                  onChangeText={(t) => changeField('password', t, 'password')}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!submitting}
                />
                {formErrors.password && <Text style={styles.fieldError}>{formErrors.password}</Text>}
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Branch *</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsContainer}
              >
                {branchChips.map((b) => {
                  const selected = form.branchCode === b.branchCode;
                  return (
                    <TouchableOpacity
                      key={b._id}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => onBranchChange(b.branchCode)}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {formErrors.branchCode && (
                <Text style={styles.fieldError}>{formErrors.branchCode}</Text>
              )}
            </View>

            {!editing && (
              <View style={styles.field}>
                <Text style={styles.label}>Membership Starting Date</Text>
                <TextInput
                  style={[styles.input, formErrors.membershipStartDate && styles.inputError]}
                  value={form.membershipStartDate}
                  onChangeText={(t) => changeField('membershipStartDate', t, 'membershipStartDate')}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={colors.textFaint}
                  autoCorrect={false}
                  autoCapitalize="none"
                  maxLength={10}
                  editable={!submitting}
                />
                {formErrors.membershipStartDate && (
                  <Text style={styles.fieldError}>{formErrors.membershipStartDate}</Text>
                )}
                <Text style={styles.hint}>
                  The day the membership actually starts (defaults to today, e.g. {todayDDMMYYYY()}).
                </Text>
              </View>
            )}

            {!editing && (
              <View style={styles.field}>
                <Text style={styles.label}>Initial Plan (optional)</Text>
                {loadingOptions ? (
                  <ActivityIndicator color={colors.accent} style={styles.optionsLoading} />
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsContainer}
                  >
                    <TouchableOpacity
                      style={[styles.chip, !form.planId && styles.chipSelected]}
                      onPress={() => changeField('planId', '')}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, !form.planId && styles.chipTextSelected]}>
                        No Plan
                      </Text>
                    </TouchableOpacity>
                    {plans.map((p) => {
                      const selected = form.planId === p._id;
                      return (
                        <TouchableOpacity
                          key={p._id}
                          style={[styles.chip, selected && styles.chipSelected]}
                          onPress={() => changeField('planId', p._id)}
                          disabled={submitting}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                            {p.name} · {formatINR(p.price)} · {p.duration}d
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Trainer (optional)</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsContainer}
              >
                <TouchableOpacity
                  style={[styles.chip, !form.trainerId && styles.chipSelected]}
                  onPress={() => changeField('trainerId', '')}
                  disabled={submitting}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, !form.trainerId && styles.chipTextSelected]}>
                    No Trainer
                  </Text>
                </TouchableOpacity>
                {/* The member is assigned to a trainer that is not in the loaded
                    options (deleted trainer, or options that did not load). Show
                    it so the assignment is visible and preserved on save. */}
                {form.trainerId &&
                  !trainers.some((t) => t._id === form.trainerId) && (
                    <View style={[styles.chip, styles.chipSelected]}>
                      <Text style={[styles.chipText, styles.chipTextSelected]}>
                        {trainerLabel(editing?.trainer, form.trainerId)}
                      </Text>
                    </View>
                  )}
                {trainers.map((t) => {
                  const selected = form.trainerId === t._id;
                  return (
                    <TouchableOpacity
                      key={t._id}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => changeField('trainerId', t._id)}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {t.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {trainers.length === 0 && !form.trainerId && (
                <Text style={styles.hint}>
                  {form.branchCode ? 'No trainers available in this branch.' : 'Select a branch first.'}
                </Text>
              )}
            </View>

            {editing && (
              <View style={styles.field}>
                <Text style={styles.label}>Status</Text>
                <View style={styles.statusRow}>
                  {(['active', 'inactive'] as const).map((s) => {
                    const selected = form.status === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.statusChip, selected && styles.statusChipSelected]}
                        onPress={() => changeField('status', s)}
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
                {form.status === 'inactive' && (
                  <Text style={styles.hint}>
                    Deactivating ends the member's sessions immediately.
                  </Text>
                )}
              </View>
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
                  {editing ? 'Save Changes' : 'Create Member'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    maxHeight: '90%',
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
  hint: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 4,
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
  optionsLoading: {
    alignSelf: 'flex-start',
    marginVertical: 4,
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