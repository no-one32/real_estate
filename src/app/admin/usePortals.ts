"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortalOverview } from "@/app/api/admin/overview/route";

export type { PortalOverview };

/** Projects with their real counts, cover, logo and files (see /api/admin/overview). */
export function usePortals() {
  const [portals, setPortals] = useState<PortalOverview[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not load");
    else {
      setErr("");
      setPortals(json.portals ?? []);
      setTotalClients(json.totalClients ?? 0);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { portals, totalClients, ready, err, setErr, reload: load };
}

export const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** % change of the last 30 days against the 30 before; null when there is nothing to compare. */
export function trend(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}
