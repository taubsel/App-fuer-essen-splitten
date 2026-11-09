"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { computeSettlement, type Settlement } from "@/lib/calc";
import { api } from "@/lib/client/api";
import type { ParticipantRow, SessionState } from "@/lib/types";
import { useToast } from "../ui";

interface Ctx {
  state: SessionState;
  code: string;
  settlement: Settlement;
  isHost: boolean;
  byId: Map<string, ParticipantRow>;
  refresh: () => Promise<void>;
  /** API-Aufruf mit Fehler-Toast und anschließendem Refresh */
  call: <T = unknown>(path: string, opts?: { method?: string; body?: unknown; form?: FormData }) => Promise<T | null>;
}

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({
  state,
  code,
  refresh,
  children,
}: {
  state: SessionState;
  code: string;
  refresh: () => Promise<void>;
  children: ReactNode;
}) {
  const toast = useToast();
  const settlement = useMemo(
    () =>
      computeSettlement({
        items: state.items,
        claims: state.claims,
        participants: state.participants,
        tipPercent: state.session.tip_percent,
      }),
    [state.items, state.claims, state.participants, state.session.tip_percent],
  );
  const byId = useMemo(() => new Map(state.participants.map((p) => [p.id, p])), [state.participants]);

  const call = useCallback(
    async <T,>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}) => {
      try {
        const res = await api<T>(`/api/sessions/${code}${path}`, opts);
        void refresh();
        return res;
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
        return null;
      }
    },
    [code, refresh, toast],
  );

  const value = useMemo(
    () => ({ state, code, settlement, isHost: state.me.is_host, byId, refresh, call }),
    [state, code, settlement, byId, refresh, call],
  );
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession außerhalb von SessionProvider");
  return ctx;
}
