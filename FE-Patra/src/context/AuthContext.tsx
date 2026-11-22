import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getStoredToken,
  onUnauthorized,
  setOfflinePreviewDemoKey,
  setStoredToken,
} from '@/lib/apiClient';
import { authApi, IS_BACKEND_ENABLED } from '@/services/api';
import { offlineMock } from '@/services/offlineMock';
import type { AuthUserDto } from '@/types';

interface AuthContextValue {
  user: AuthUserDto | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUserDto>;
  demoLogin: (demoKey: string) => Promise<AuthUserDto>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const token = getStoredToken();
      if (!token) {
        if (active) setIsLoading(false);
        return;
      }

      if (!IS_BACKEND_ENABLED) {
        if (token.startsWith('mock:')) {
          const demoKey = token.slice('mock:'.length);
          if (active) {
            setUser(offlineMock.getUserByDemoKey(demoKey));
            setIsLoading(false);
          }
          return;
        }
        setStoredToken(null);
        if (active) setIsLoading(false);
        return;
      }

      try {
        const me = await authApi.me();
        if (active) setUser(me);
      } catch {
        setStoredToken(null);
        if (active) setUser(null);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    onUnauthorized(() => {
      setStoredToken(null);
      setOfflinePreviewDemoKey(null);
      setUser(null);
    });

    void hydrate();

    return () => {
      active = false;
      onUnauthorized(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setStoredToken(data.token);
    if (data.token.startsWith('mock:')) {
      setOfflinePreviewDemoKey(data.token.slice('mock:'.length));
    } else {
      setOfflinePreviewDemoKey(null);
    }
    setUser(data.user);
    return data.user;
  }, []);

  const demoLogin = useCallback(async (demoKey: string) => {
    const data = await authApi.demoLogin(demoKey);
    setStoredToken(data.token);
    if (data.token.startsWith('mock:')) {
      setOfflinePreviewDemoKey(demoKey);
    } else {
      setOfflinePreviewDemoKey(null);
    }
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setStoredToken(null);
    setOfflinePreviewDemoKey(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login,
      demoLogin,
      logout,
    }),
    [user, isLoading, login, demoLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  }
  return ctx;
}
