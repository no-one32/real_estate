"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell, { NOTIF_SEEN_KEY } from "../AdminShell";
import { ago } from "../useAnalytics";

type Lead = {
  id: string;
  created_at: string;
  nom: string;
  prenom: string;
  email: string;
  tel: string;
  unit_display_id: string | null;
  complex_id: string | null;
  status: string | null;
  subject: string | null;
  message: string | null;
  project: string;
};

const STATUS_LABEL: Record<string, string> = { new: "New", in_progress: "In progress", sold: "Sold" };

/** New interested buyers over all portals. Opening the page marks them as seen (badge back to 0). */
export default function NotificationsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [seenBefore, setSeenBefore] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const prev = localStorage.getItem(NOTIF_SEEN_KEY);
    setSeenBefore(prev);
    void fetch("/api/admin/notifications")
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) setErr(j.error || "Could not load");
        else setLeads(j.leads ?? []);
      })
      .finally(() => localStorage.setItem(NOTIF_SEEN_KEY, new Date().toISOString()));
  }, []);

  const isNew = (l: Lead) => !seenBefore || new Date(l.created_at) > new Date(seenBefore);

  return (
    <AdminShell>
      <header className="axa-head">
        <div>
          <h1>Notifications</h1>
          <p>People who asked about a villa, on every portal. The newest first.</p>
        </div>
      </header>
      {err && <p className="err">{err}</p>}
      {!leads && !err && <p className="muted">Loading…</p>}
      {leads && !leads.length && <p className="axa-empty">Nothing yet. New interested buyers will appear here.</p>}
      <ul className="axa-notifs">
        {leads?.map((l) => (
          <li key={l.id} className={isNew(l) ? "new" : ""}>
            <span className="axa-avatar sm">{`${l.prenom?.[0] ?? ""}${l.nom?.[0] ?? ""}`.toUpperCase() || "?"}</span>
            <div className="axa-notif-body">
              <p>
                <b>{`${l.prenom ?? ""} ${l.nom ?? ""}`.trim() || l.email}</b> is interested
                {l.unit_display_id ? <> in villa <b>{l.unit_display_id}</b></> : null}
                {l.project !== "—" ? <> on <b>{l.project}</b></> : null}
              </p>
              <small>
                {[l.email, l.tel].filter(Boolean).join(" · ")}
                {l.subject ? ` · ${l.subject}` : ""}
              </small>
              {l.message ? <q>{l.message}</q> : null}
            </div>
            <div className="axa-notif-side">
              <em>{ago(l.created_at)}</em>
              {l.status && <span className={`axa-pill inline ${l.status === "sold" ? "green" : l.status === "in_progress" ? "orange" : ""}`}>{STATUS_LABEL[l.status] ?? l.status}</span>}
              {l.complex_id && <Link className="axa-link" href={`/admin/complexes/${l.complex_id}?tab=leads`}>Open</Link>}
            </div>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
