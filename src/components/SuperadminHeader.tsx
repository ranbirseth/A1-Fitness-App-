import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDrawer } from './drawer/DrawerContext';
import { colors } from '../theme/colors';

interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}

export function SuperadminHeader({ title, subtitle, right, onBack }: Props) {
  const { open } = useDrawer();

  return (
    <View style={styles.headerRow}>
      <TouchableOpacity style={styles.hamburger} onPress={open} activeOpacity={0.7} hitSlop={8}>
        <Text style={styles.hamburgerIcon}>☰</Text>
      </TouchableOpacity>
      {onBack ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7} hitSlop={8}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  hamburger: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(30,32,44,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  hamburgerIcon: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(30,32,44,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backIcon: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  titleWrap: {
    flex: 1,
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
  right: {
    marginLeft: 12,
  },
});