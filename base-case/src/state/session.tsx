import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeResponse } from '@shared/api';
import { auth } from '@/api/endpoints';
import { ApiError } from '@/api/client';

interface SessionCtx {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<MeResponse | null>;
  setMe: (m: MeResponse | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const m = await auth.me({ noRedirect: true });
      setMe(m);
      setError(null);
      return m;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
      } else {
        setError(e instanceof Error ? e.message : String(e));
        setMe(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setMe(null);
    }
  }, []);

  const value = useMemo(() => ({ me, loading, error, refresh, setMe, logout }), [me, loading, error, refresh, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

export function useUser() {
  return useSession().me?.user ?? null;
}

export function isStaff(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'advisor';
}
