import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";

const POLL_MS = 30_000;

export function useBellCount() {
  const { token, user } = useAuth();
  const [count, setCount] = useState(0);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!token || !user) { setCount(0); return; }
    try {
      const res = await fetch("/notifications/unread-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCount(data.unread_count ?? 0);
      }
    } catch { /* silent */ }
  }, [token, user]);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  return { count, refresh };
}
