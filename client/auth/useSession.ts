import { useEffect, useState } from 'react';
import type { User } from '../../shared/contracts';
import { setCsrf } from '../api';
import { queries } from '../data/read-models';
import { commands } from '../data/write-models';

/** 会话失效后卸载工作空间，防止上一位成员的编辑状态进入下一次登录。 */
export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  useEffect(() => {
    let active = true;
    queries
      .session()
      .then((result) => {
        if (active) {
          setUser(result.user);
          setCsrf(result.csrf);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setInitializing(false);
        }
      });
    const expired = () => {
      setCsrf('');
      setUser(null);
    };
    window.addEventListener('session-expired', expired);
    return () => {
      active = false;
      window.removeEventListener('session-expired', expired);
    };
  }, []);

  async function logout() {
    await commands.logout();
    setCsrf('');
    setUser(null);
  }
  return { user, initializing, onLogin: setUser, logout };
}
