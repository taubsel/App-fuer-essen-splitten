"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionState } from "@/lib/types";
import { api, ApiError } from "./api";
import { supabase } from "./supabase";

export type LoadStatus = "loading" | "ready" | "not-member" | "not-found" | "error";

/**
 * Lädt den Zustand einer Runde und hält ihn live:
 * Der Server schickt nach jeder Änderung einen datenlosen "refresh"-Ping über Supabase Realtime.
 */
export function useSessionState(code: string) {
  const [state, setState] = useState<SessionState | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      do {
        again.current = false;
        const data = await api<SessionState>(`/api/sessions/${code}/state`);
        setState(data);
        setStatus("ready");
        setError(null);
      } while (again.current);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setStatus("not-member");
      else if (err instanceof ApiError && err.status === 404) setStatus("not-found");
      else {
        setError(err instanceof Error ? err.message : String(err));
        setStatus((s) => (s === "ready" ? s : "error"));
      }
    } finally {
      inflight.current = false;
    }
  }, [code]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- erster Ladevorgang
    void refresh();
  }, [refresh]);

  const sessionId = state?.session.id;
  useEffect(() => {
    if (!sessionId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ping = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 120);
    };
    const channel = supabase()
      .channel(`session-${sessionId}`)
      .on("broadcast", { event: "refresh" }, ping)
      .subscribe((s) => {
        if (s === "SUBSCRIBED") ping();
      });
    const onVisible = () => document.visibilityState === "visible" && ping();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", ping);
    const poll = setInterval(ping, 20_000); // Fallback, falls ein Ping verloren geht
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", ping);
      void supabase().removeChannel(channel);
    };
  }, [sessionId, refresh]);

  return { state, status, error, refresh };
}
