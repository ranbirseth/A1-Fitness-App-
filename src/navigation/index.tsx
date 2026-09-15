import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SuperadminDashboardScreen } from '../screens/SuperadminDashboardScreen';
import { SuperadminBranchesScreen } from '../screens/SuperadminBranchesScreen';
import { BranchDetailsScreen } from '../screens/BranchDetailsScreen';
import { SuperadminAdminsScreen } from '../screens/SuperadminAdminsScreen';
import { SuperadminMembersScreen } from '../screens/SuperadminMembersScreen';
import { MemberDetailsScreen } from '../screens/MemberDetailsScreen';
import { SuperadminPlansScreen } from '../screens/SuperadminPlansScreen';
import { SuperadminAttendanceScreen } from '../screens/SuperadminAttendanceScreen';
import { AdminAttendanceScreen } from '../screens/AdminAttendanceScreen';
import { ScannerListScreen } from '../screens/ScannerListScreen';
import { ScannerDetailsScreen } from '../screens/ScannerDetailsScreen';
import { ScannerFormScreen } from '../screens/ScannerFormScreen';
import { SuperadminPaymentsScreen } from '../screens/SuperadminPaymentsScreen';
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen';
import { AdminMembersScreen } from '../screens/AdminMembersScreen';
import { AdminMemberDetailsScreen } from '../screens/AdminMemberDetailsScreen';
import { AdminPlansScreen } from '../screens/AdminPlansScreen';
import { AdminPaymentsScreen } from '../screens/AdminPaymentsScreen';
import { DrawerProvider } from '../components/drawer/DrawerContext';
import { RoleDrawerHost } from '../components/drawer/RoleDrawerHost';
import { ScannerProvider } from '../mocks/ScannerProvider';
import { ScannerIntegrationScreen } from '../screens/ScannerIntegrationScreen';
import { ScannerSetupScreen } from '../screens/ScannerSetupScreen';
import { ScannerDetailScreen } from '../screens/ScannerDetailScreen';
import { colors } from '../theme/colors';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.background,
    primary: colors.primary,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootNavigator() {
  const { status, user } = useAuth();

  if (status === 'restoring') {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <ScannerProvider>
        <DrawerProvider>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {status === 'authenticated' ? (
              user?.role === 'superadmin' ? (
                <>

                  <Stack.Screen name="SuperadminDashboard" component={SuperadminDashboardScreen} />
                  <Stack.Screen name="SuperadminBranches" component={SuperadminBranchesScreen} />
                  <Stack.Screen name="BranchDetails" component={BranchDetailsScreen} />
                  <Stack.Screen name="SuperadminAdmins" component={SuperadminAdminsScreen} />
                  <Stack.Screen name="SuperadminMembers" component={SuperadminMembersScreen} />
                  <Stack.Screen name="MemberDetails" component={MemberDetailsScreen} />
                  <Stack.Screen name="SuperadminPlans" component={SuperadminPlansScreen} />
                  <Stack.Screen name="SuperadminAttendance" component={SuperadminAttendanceScreen} />
                  <Stack.Screen name="SuperadminPayments" component={SuperadminPaymentsScreen} />
                  <Stack.Screen name="ScannerList" component={ScannerListScreen} />
                  <Stack.Screen name="ScannerDetails" component={ScannerDetailsScreen} />
                  <Stack.Screen name="ScannerForm" component={ScannerFormScreen} />
                </>
              ) : user?.role === 'admin' ? (
                <>
                  <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
                  <Stack.Screen name="AdminMembers" component={AdminMembersScreen} />
                  <Stack.Screen name="AdminMemberDetails" component={AdminMemberDetailsScreen} />
                  <Stack.Screen name="AdminPlans" component={AdminPlansScreen} />
                  <Stack.Screen name="AdminPayments" component={AdminPaymentsScreen} />
                  <Stack.Screen name="AdminAttendance" component={AdminAttendanceScreen} />
                  <Stack.Screen name="ScannerList" component={ScannerListScreen} />
                  <Stack.Screen name="ScannerDetails" component={ScannerDetailsScreen} />
                  <Stack.Screen name="ScannerForm" component={ScannerFormScreen} />
                  <Stack.Screen name="ScannerIntegration" component={ScannerIntegrationScreen} />
                  <Stack.Screen name="ScannerSetup" component={ScannerSetupScreen} />
                  <Stack.Screen name="ScannerDetail" component={ScannerDetailScreen} />
                </>
              ) : (
                <Stack.Screen name="Home" component={HomeScreen} />
              )
            ) : (
              <Stack.Screen name="Login" component={LoginScreen} />
            )}
          </Stack.Navigator>
          <RoleDrawerHost />
        </DrawerProvider>
      </ScannerProvider>
    </NavigationContainer>
  );
}
