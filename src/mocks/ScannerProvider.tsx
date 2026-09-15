import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type MockScanner,
  type ScannerFormValues,
  createSeedScanners,
  nowIsoForStore,
  trimScannerValues,
} from './scannerData';

export interface TestOutcome {
  ok: boolean;
  message: string;
}

interface ScannerContextValue {
  scanners: MockScanner[];
  testingIds: string[];
  getScanner: (id: string) => MockScanner | undefined;
  addScanner: (values: ScannerFormValues) => MockScanner;
  updateScanner: (id: string, values: ScannerFormValues) => MockScanner | undefined;
  removeScanner: (id: string) => void;
  runConnectionTest: (id: string) => Promise<TestOutcome>;
}

const ScannerContext = createContext<ScannerContextValue | undefined>(undefined);

function newId(): string {
  return 'scn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function buildScanner(values: ScannerFormValues, overrides: Partial<MockScanner>): MockScanner {
  const clean = trimScannerValues(values);
  const now = nowIsoForStore();
  return {
    id: overrides.id ?? newId(),
    name: clean.name,
    model: clean.model,
    branchId: clean.branchId,
    branchName: clean.branchName,
    connectionMethod: clean.connectionMethod,
    ipAddress: clean.ipAddress,
    port: clean.port,
    deviceId: clean.deviceId,
    username: clean.username,
    password: clean.password,
    apiUrl: clean.apiUrl,
    serverUrl: clean.serverUrl,
    gatewayUrl: clean.gatewayUrl,
    pushKey: clean.pushKey,
    apiKey: clean.apiKey,
    notes: clean.notes,
    status: overrides.status ?? 'NOT_TESTED',
    lastTestedAt: overrides.lastTestedAt,
    createdAt: overrides.createdAt ?? now,
    updatedAt: now,
    ...overrides,
  };
}

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const [scanners, setScanners] = useState<MockScanner[]>(() => createSeedScanners());
  const [testingIds, setTestingIds] = useState<string[]>([]);
  const testingRef = useRef<Set<string>>(new Set());

  const getScanner = useCallback(
    (id: string) => scanners.find((s) => s.id === id),
    [scanners]
  );

  const addScanner = useCallback((values: ScannerFormValues) => {
    const scanner = buildScanner(values, {});
    setScanners((prev) => [scanner, ...prev]);
    return scanner;
  }, []);

  const updateScanner = useCallback((id: string, values: ScannerFormValues) => {
    let updated: MockScanner | undefined;
    setScanners((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const keepSecret = (next: string, existing?: string) =>
          next.trim() ? next.trim() : existing;
        updated = buildScanner(values, {
          id: s.id,
          status: s.status,
          lastTestedAt: s.lastTestedAt,
          createdAt: s.createdAt,
          password: keepSecret(values.password, s.password),
          pushKey: keepSecret(values.pushKey, s.pushKey),
          apiKey: keepSecret(values.apiKey, s.apiKey),
        });
        return updated;
      })
    );
    return updated;
  }, []);

  const removeScanner = useCallback((id: string) => {
    setScanners((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const runConnectionTest = useCallback(
    (id: string) =>
      new Promise<TestOutcome>((resolve) => {
        if (testingRef.current.has(id)) {
          resolve({ ok: false, message: 'This scanner is already being tested.' });
          return;
        }
        testingRef.current.add(id);
        setTestingIds((prev) => [...prev, id]);

        const finish = (outcome: TestOutcome) => {
          testingRef.current.delete(id);
          setTestingIds((prev) => prev.filter((x) => x !== id));
          setScanners((prev) =>
            prev.map((s) =>
              s.id === id ? { ...s, status: outcome.ok ? 'DEMO_CONNECTED' : 'DEMO_FAILED', lastTestedAt: nowIsoForStore() } : s
            )
          );
          resolve(outcome);
        };

        const delay = 1200 + Math.random() * 800;
        setTimeout(() => {
          const ok = Math.random() < 0.75;
          finish(
            ok
              ? {
                  ok: true,
                  message: 'Demo connection successful (mock only). Real device verification will be added later.',
                }
              : {
                  ok: false,
                  message: 'Mock connection test failed – no response from the device address. Please verify the configuration and retry.',
                }
          );
        }, delay);
      }),
    []
  );

  const value = useMemo(
    () => ({
      scanners,
      testingIds,
      getScanner,
      addScanner,
      updateScanner,
      removeScanner,
      runConnectionTest,
    }),
    [scanners, testingIds, getScanner, addScanner, updateScanner, removeScanner, runConnectionTest]
  );

  return <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>;
}

export function useScanners(): ScannerContextValue {
  const ctx = useContext(ScannerContext);
  if (!ctx) {
    throw new Error('useScanners must be used within a ScannerProvider');
  }
  return ctx;
}