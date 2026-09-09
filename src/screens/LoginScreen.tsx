import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { colors } from '../theme/colors';

type Role = 'admin' | 'superadmin';

interface Errors {
  gymId?: string;
  email?: string;
  password?: string;
  role?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function friendlyMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('inactive') || lower.includes('disabled') || lower.includes('deactivated')) {
    return 'This account is inactive. Contact your administrator.';
  }
  if (
    lower.includes('credential') ||
    lower.includes('invalid') ||
    lower.includes('password') ||
    lower.includes('email')
  ) {
    return 'The credentials you entered are incorrect.';
  }
  return message;
}

export function LoginScreen() {
  const { login } = useAuth();

  const [gymId, setGymId] = useState('MAIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('superadmin');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = useCallback((): Errors => {
    const next: Errors = {};
    if (!gymId.trim()) next.gymId = 'Gym ID is required.';
    if (!email.trim()) {
      next.email = 'Email is required.';
    } else if (!isValidEmail(email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!password) {
      next.password = 'Password is required.';
    } else if (password.length < 6) {
      next.password = 'Password must be at least 6 characters.';
    }
    if (!role) next.role = 'Select a role.';
    return next;
  }, [gymId, email, password, role]);

  const handleLogin = useCallback(async () => {
    setFormError(null);
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    // TEMP-DIAG: safe login payload diagnostic (no password/tokens printed).
    console.log('[LOGIN-DIAG]', JSON.stringify({ gymId: gymId.trim(), email: email.trim().toLowerCase(), role }));
    try {
      await login({
        gymId: gymId.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unable to sign in. Please try again.';
      setFormError(friendlyMessage(message));
    } finally {
      setSubmitting(false);
    }
  }, [login, gymId, email, password, role, validate]);

  const clearFieldError = (field: keyof Errors) => {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.logoMark}>
              <Text style={styles.logoMarkText}>A1</Text>
            </View>
            <Text style={styles.brandName}>A1 FITNESS</Text>
            <Text style={styles.brandTagline}>Staff Access</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>Sign in</Text>
            <Text style={styles.subheading}>Enter your staff credentials</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Gym ID</Text>
              <TextInput
                style={[styles.input, errors.gymId && styles.inputError]}
                value={gymId}
                onChangeText={(t) => {
                  setGymId(t);
                  clearFieldError('gymId');
                }}
                placeholder="e.g. MAIN"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!submitting}
                returnKeyType="next"
              />
              {errors.gymId && <Text style={styles.fieldError}>{errors.gymId}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  clearFieldError('email');
                }}
                placeholder="name@example.com"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!submitting}
                returnKeyType="next"
              />
              {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.passwordBox, errors.password && styles.inputError]}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    clearFieldError('password');
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!submitting}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  disabled={submitting}
                >
                  <Text style={styles.toggleText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.roleRow}>
                {(['admin', 'superadmin'] as Role[]).map((r) => {
                  const selected = role === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleChip, selected && styles.roleChipSelected]}
                      onPress={() => {
                        setRole(r);
                        clearFieldError('role');
                      }}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          selected && styles.roleChipTextSelected,
                        ]}
                      >
                        {r === 'superadmin' ? 'Super Admin' : 'Admin'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {errors.role && <Text style={styles.fieldError}>{errors.role}</Text>}
            </View>

            {formError && (
              <View style={styles.formErrorBox}>
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  brand: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 36,
  },
  logoMark: {
    width: 84,
    height: 84,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoMarkText: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 3,
  },
  brandTagline: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 6,
    letterSpacing: 1,
  },
  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  heading: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  subheading: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 6,
    marginBottom: 24,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    height: 54,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
  },
  inputError: {
    borderColor: colors.danger,
  },
  passwordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    height: 54,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    padding: 0,
    margin: 0,
  },
  toggleText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleChip: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceAlt,
  },
  roleChipText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  roleChipTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  fieldError: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 6,
  },
  formErrorBox: {
    backgroundColor: 'rgba(229,72,77,0.12)',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  formErrorText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
