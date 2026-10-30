import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";

const POLL_MS = 30_000;

export function useBellCount() {
  const [count, setCount] = useState(0);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setCount(0);
      return;
    }
    try {
      const data = await api.get("/notifications/unread-count");
      if (data && typeof data.unread_count === 'number') {
        setCount(data.unread_count);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  return { count, refresh };
}
