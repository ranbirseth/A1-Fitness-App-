import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { useDrawer, type DrawerKey } from './DrawerContext';
import { colors } from '../../theme/colors';
import type { AppStackParamList } from '../../navigation/types';

interface NavItemDef {
  key: DrawerKey;
  label: string;
  icon: string;
  route?: 'SuperadminDashboard' | 'SuperadminBranches' | 'SuperadminAdmins' | 'SuperadminMembers' | 'SuperadminTrainers' | 'SuperadminPlans' | 'SuperadminAttendance' | 'SuperadminPayments' | 'SuperadminSettings' | 'ScannerList';
  enabled: boolean;
}

const MAIN_ITEMS: NavItemDef[] = [
  { key: 'Dashboard', label: 'Dashboard', icon: '▦', route: 'SuperadminDashboard', enabled: true },
  { key: 'Branches', label: 'Branches', icon: '♢', route: 'SuperadminBranches', enabled: true },
  { key: 'Admins', label: 'Admins', icon: '👤', route: 'SuperadminAdmins', enabled: true },
  { key: 'Members', label: 'Members', icon: '▤', route: 'SuperadminMembers', enabled: true },
  { key: 'Trainers', label: 'Trainers', icon: '▣', route: 'SuperadminTrainers', enabled: true },
  { key: 'Plans', label: 'Plans', icon: '▧', route: 'SuperadminPlans', enabled: true },
  { key: 'Attendance', label: 'Attendance', icon: '◆', route: 'SuperadminAttendance', enabled: true },
  { key: 'Scanners', label: 'Scanners', icon: '▰', route: 'ScannerList', enabled: true },
];

const PAYMENT_ITEMS: NavItemDef[] = [
  { key: 'Payments', label: 'Payments & Reminders', icon: '₹', route: 'SuperadminPayments', enabled: true },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.82, 340);

export function SuperadminDrawer({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { logout } = useAuth();
  const { activeKey } = useDrawer();

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(translateX, {
        toValue: -DRAWER_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible, rendered, translateX]);

  const navigateTo = (route?: NavItemDef['route']) => {
    if (!route) return;
    onClose();
    navigation.navigate(route as never);
  };

  const handleLogout = () => {
    onClose();
    logout();
  };

  if (!visible && !rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.drawer,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, transform: [{ translateX }] },
          ]}
        >
          {/* Branding */}
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <Text style={styles.logoMarkText}>A1</Text>
            </View>
            <View>
              <Text style={styles.brandName}>A1 FITNESS</Text>
              <Text style={styles.brandTag}>Super Admin</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Main items */}
          <View style={styles.navGroup}>
            {MAIN_ITEMS.map((item) => (
              <NavRow
                key={item.key}
                item={item}
                active={activeKey === item.key}
                onPress={() => navigateTo(item.route)}
              />
            ))}
          </View>

          {/* Payment items */}
          <View style={styles.navGroup}>
            {PAYMENT_ITEMS.map((item) => (
              <NavRow
                key={item.key}
                item={item}
                active={activeKey === item.key}
                onPress={() => navigateTo(item.route)}
              />
            ))}
          </View>

          <View style={styles.flexSpacer} />

          <View style={styles.divider} />

          {/* Bottom items */}
          <View style={styles.navGroup}>
            <NavRow
              item={{ key: 'Settings', label: 'Settings', icon: '⚙', enabled: false }}
              active={false}
              onPress={() => undefined}
            />
            <TouchableOpacity
              style={styles.logoutRow}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Text style={styles.rowIcon}>↪</Text>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Pressable style={styles.backdrop} onPress={onClose} />
      </View>
    </Modal>
  );
}

function NavRow({
  item,
  active,
  onPress,
}: {
  item: NavItemDef;
  active: boolean;
  onPress: () => void;
}) {
  const disabled = !item.enabled;
  return (
    <TouchableOpacity
      style={[styles.navRow, active && styles.navRowActive, disabled && styles.navRowDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.rowIcon, active && styles.rowIconActive]}>{item.icon}</Text>
      <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{item.label}</Text>
      {disabled && <Text style={styles.rowSoon}>Soon</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    maxWidth: '82%',
    backgroundColor: '#0d0f16',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoMarkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  brandName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandTag: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 14,
  },
  navGroup: {
    marginBottom: 8,
  },
  flexSpacer: {
    flex: 1,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  navRowActive: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
  },
  navRowDisabled: {
    opacity: 0.4,
  },
  rowIcon: {
    color: colors.textMuted,
    fontSize: 18,
    width: 28,
  },
  rowIconActive: {
    color: colors.accent,
  },
  rowLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  rowLabelActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  rowSoon: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '600',
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  logoutText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },
});