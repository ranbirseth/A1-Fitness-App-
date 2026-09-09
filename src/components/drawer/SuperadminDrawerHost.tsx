import React from 'react';
import { useDrawer } from './DrawerContext';
import { SuperadminDrawer } from './SuperadminDrawer';

export function SuperadminDrawerHost() {
  const { isOpen, close } = useDrawer();
  return <SuperadminDrawer visible={isOpen} onClose={close} />;
}