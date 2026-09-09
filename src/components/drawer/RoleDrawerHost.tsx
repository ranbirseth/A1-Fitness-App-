import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useDrawer } from './DrawerContext';
import { SuperadminDrawer } from './SuperadminDrawer';
import { AdminDrawer } from './AdminDrawer';

export function RoleDrawerHost() {
  const { user } = useAuth();
  const { isOpen, close } = useDrawer();

  if (user?.role === 'admin') {
    return <AdminDrawer visible={isOpen} onClose={close} />;
  }

  return <SuperadminDrawer visible={isOpen} onClose={close} />;
}
