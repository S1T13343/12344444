import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore, User } from './api';

export interface PublicConfig {
  paymentMode: 'stripe' | 'mock';
  stripePublishableKey: string | null;
  googleMapsKey: string | null;
}

interface Ctx {
  user: User | null;
  ready: boolean;
  config: PublicConfig;
  login: (email: string, password: string) => Promise<User>;
  register: (data: Record<string, string>) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<PublicConfig>({ paymentMode: 'mock', stripePublishableKey: null, googleMapsKey: null });
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.get()) return setUser(null);
    try {
      setUser(await api<User>('/auth/me'));
    } catch {
      tokenStore.set(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([refreshUser(), api<PublicConfig>('/config').then(setConfig).catch(() => {})]).finally(() =>
      setReady(true),
    );
  }, [refreshUser]);

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const auth = async (path: string, body: unknown) => {
    const r = await api<{ token: string; user: User }>(path, { body });
    tokenStore.set(r.token);
    setUser(r.user);
    return r.user;
  };

  return (
    <AppCtx.Provider
      value={{
        user,
        ready,
        config,
        login: (email, password) => auth('/auth/login', { email, password }),
        register: (data) => auth('/auth/register', data),
        logout: () => {
          tokenStore.set(null);
          setUser(null);
        },
        refreshUser,
        toast,
      }}
    >
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
