"use client";

import { useEffect, useState } from "react";

export type AdminAnalytics = {
  days: number;
  totals: { visits: number; visitsBefore: number; leads: number; leadsPeriod: number; avgSeconds: number };
  daily: { day: string; visits: number }[];
  perProject: { id: string; name: string; slug: string; published: boolean; visits: number; before: number; avgSeconds: number }[];
  sources: { key: string; count: number }[];
  devices: { key: string; count: number }[];
  recentLeads: {
    id: string;
    created_at: string;
    nom: string;
    prenom: string;
    email: string;
    tel: string;
    unit_display_id: string | null;
    complex_id: string | null;
    status: string | null;
    project: string;
  }[];
};

export function useAnalytics(days: number) {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    setErr("");
    void fetch(`/api/admin/analytics?days=${days}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) setErr(j.error || "Could not load the numbers");
        else setData(j);
      })
      .catch(() => alive && setErr("Could not load the numbers"));
    return () => {
      alive = false;
    };
  }, [days]);
  return { data, err };
}

export const duration = (s: number) => (s ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : "—");

export const SOURCE_LABEL: Record<string, string> = {
  direct: "Direct link",
  qr: "QR code",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  google: "Google",
  other: "Other",
};
export const DEVICE_LABEL: Record<string, string> = { mobile: "Phone", desktop: "Computer", tablet: "Tablet", unknown: "Unknown" };

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString("en-GB");
};
