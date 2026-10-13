import { useCallback, useEffect, useState } from 'react';
import { ROLE_KEY, TOKEN_KEY } from './api';

export interface Session {
  token: string | null;
  role: string | null;
  refresh: () => void;
}

function readSession(): { token: string | null; role: string | null } {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY),
      role: localStorage.getItem(ROLE_KEY),
    };
  } catch {
    return { token: null, role: null };
  }
}

export function useSession(): Session {
  const [s, setS] = useState(readSession);
  const refresh = useCallback(() => setS(readSession()), []);
  useEffect(() => {
    window.addEventListener('ts-auth-change', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('ts-auth-change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);
  return { token: s.token, role: s.role, refresh };
}
