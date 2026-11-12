import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeResponse, ProductInfo } from '@shared/api';
import { PRODUCTS, productConfig, type ProductConfig, type ProductKey } from '@shared/product';
import { auth } from '@/api/endpoints';
import { ApiError } from '@/api/client';

interface SessionCtx {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
  /** The product this deployment serves (Base Case, Flight Plan or Sprout); known before sign-in via GET /api/product */
  product: ProductConfig;
  /** Public descriptor from the server (firm name before sign-in) */
  productInfo: ProductInfo | null;
  refresh: () => Promise<MeResponse | null>;
  setMe: (m: MeResponse | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);

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

  // Product branding is public: fetch it once so the sign-in page already carries the right name.
  useEffect(() => {
    let cancelled = false;
    auth
      .product()
      .then((p) => {
        if (!cancelled) setProductInfo(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const productKey: ProductKey = me?.firm.product ?? productInfo?.key ?? 'base-case';
  const product = productConfig(productKey) ?? PRODUCTS['base-case'];

  useEffect(() => {
    document.title = product.name;
    document.documentElement.dataset.product = product.key;
    // Tab icon: the Base Case line chart, the original Flight Plan chevron, or Sprout's serif S on deep green.
    const icon = document.getElementById('favicon') as HTMLLinkElement | null;
    if (icon) icon.href = product.key === 'base-case' ? '/favicon.svg' : `/favicon-${product.key}.svg`;
  }, [product.name, product.key]);

  // Another tab may sign in as a different user (one cookie jar per browser). When this tab regains focus, re-check
  // who the session belongs to and reload if it changed, so a stale tab never acts as the wrong user.
  const meId = me?.user.id ?? null;
  useEffect(() => {
    if (!meId) return;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const m = await auth.me({ noRedirect: true });
        if (m.user.id !== meId) window.location.reload();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) window.location.reload();
      }
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [meId]);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setMe(null);
    }
  }, []);

  const value = useMemo(() => ({ me, loading, error, product, productInfo, refresh, setMe, logout }), [me, loading, error, product, productInfo, refresh, logout]);
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

/** The deployment's product (Base Case / Flight Plan): name, tagline, phase labels, defaults. */
export function useProduct(): ProductConfig {
  return useSession().product;
}

export function isStaff(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'advisor';
}
