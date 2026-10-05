"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminState, api, ApiError } from "@/lib/api";

// Loads dispatcher state and refreshes it whenever the server says jobs changed.
export function useAdmin() {
  const [state, setState] = useState<AdminState | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  const [error, setError] = useState("");
  const ws = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api<AdminState>("/api/admin/state", { admin: true });
      setState(s);
      setNeedsPin(false);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedsPin(true);
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      ws.current = socket;
      socket.onmessage = (ev) => {
        try {
          if (JSON.parse(ev.data).type === "JOBS_CHANGED") refresh();
        } catch {
          /* ignore */
        }
      };
      socket.onclose = () => {
        if (!closed) timer = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws.current?.close();
    };
  }, [refresh]);

  return { state, setState, refresh, needsPin, error };
}
