import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type DrawerKey =
  | 'Dashboard'
  | 'Branches'
  | 'Admins'
  | 'Members'
  | 'Trainers'
  | 'Plans'
  | 'Attendance'
  | 'Scanners'
  | 'Payments'
  | 'Settings';

interface DrawerContextValue {
  isOpen: boolean;
  activeKey: DrawerKey;
  open: () => void;
  close: () => void;
  setActive: (key: DrawerKey) => void;
}

const DrawerContext = createContext<DrawerContextValue | undefined>(undefined);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<DrawerKey>('Dashboard');

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const setActive = useCallback((key: DrawerKey) => {
    setActiveKey(key);
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({ isOpen, activeKey, open, close, setActive }),
    [isOpen, activeKey, open, close, setActive]
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    throw new Error('useDrawer must be used within a DrawerProvider');
  }
  return ctx;
}