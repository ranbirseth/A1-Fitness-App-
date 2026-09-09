import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';

// Temporary authenticated placeholder proving login succeeded.
export function HomeScreen() {
  const { user, logout, busy } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.logo}>A1 FITNESS</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Signed in</Text>
        <Text style={styles.subtitle}>Welcome, {user?.name ?? user?.email}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {user?.role === 'superadmin' ? 'SUPER ADMIN' : 'ADMIN'}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={logout}
        disabled={busy}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>{busy ? 'Signing out…' : 'Log out'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 8,
  },
  logo: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    marginBottom: 20,
  },
  badge: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  badgeText: {
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 12,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
