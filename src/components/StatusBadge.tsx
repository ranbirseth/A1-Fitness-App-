import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

function resolveColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'active') return colors.success;
  if (s === 'inactive') return colors.danger;
  if (s === 'pending') return '#f59e0b';
  if (s === 'expired' || s === 'cancelled') return colors.danger;
  return colors.textMuted;
}

export function StatusBadge({ status }: { status: string }) {
  const color = resolveColor(status);
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});