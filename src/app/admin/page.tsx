"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import AdminShell from "./AdminShell";
import { useConfirm } from "@/components/ConfirmDialog";
import { fmt, trend, usePortals, type PortalOverview } from "./usePortals";
import type { PortalStatus } from "@/lib/portal-status";
import {
  AiExternal,
  AiEye,
  AiGear,
  AiGlobe,
  AiGridView,
  AiLeads,
  AiListView,
  AiPlus,
  AiSearch,
  AiSliders,
  AiTrash,
  AiUsers,
} from "./AdminIcons";

type Filter = "all" | PortalStatus;

const STATUS: Record<PortalStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "green" },
  pending: { label: "Pending", color: "orange" },
  suspended: { label: "Suspended", color: "red" },
};

function Trend({ value }: { value: number | null }) {
  if (value === null) return null;
  return <em className={`axa-trend${value < 0 ? " down" : ""}`}>{value >= 0 ? "↑" : "↓"} {Math.abs(value)}%</em>;
}

function Monogram({ p }: { p: PortalOverview }) {
  const src = p.logo || p.agencyLogo;
  if (src) return <img src={src} alt="" />;
  return <span>{p.name.trim()[0]?.toUpperCase() || "?"}</span>;
}

export default function PortalsPage() {
  const { portals, totalClients, ready, err, setErr, reload } = usePortals();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  // "Create New Portal" from the Dashboard opens the form here
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") setCreating(true);
  }, []);
  // the "···" menu closes on a click elsewhere or Escape
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".axa-more")) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const live = portals.filter((p) => p.published).length;
  const visits = portals.reduce((s, p) => s + p.visits, 0);
  const v30 = portals.reduce((s, p) => s + p.visits30, 0);
  const vPrev = portals.reduce((s, p) => s + p.visitsPrev30, 0);
  const leads = portals.reduce((s, p) => s + p.leads, 0);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return portals.filter(
      (p) =>
        (filter === "all" || filter === p.status) &&
        (!needle || [p.name, p.city ?? "", ...p.clients.map((c) => `${c.name} ${c.email ?? ""}`)].join(" ").toLowerCase().includes(needle)),
    );
  }, [portals, filter, q]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/complexes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && city.trim() && json.complex?.id) {
      await createBrowserSupabase()?.from("complexes").update({ city: city.trim() }).eq("id", json.complex.id);
    }
    setBusy(false);
    if (!res.ok) {
      setErr(json.error || "Could not create");
      return;
    }
    setCreating(false);
    setName("");
    setCity("");
    // straight to the new portal so the logo, photos and client can be added
    router.push(`/admin/complexes/${json.complex.id}?tab=media`);
  };

  const remove = async (p: PortalOverview) => {
    setMenu(null);
    if (!(await confirm(`Delete ${p.name}? Villas, photos, and this tour go with it. Clients stay.`, "Delete portal"))) return;
    const res = await fetch("/api/admin/complexes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not delete");
    else void reload();
  };

  const setStatus = async (p: PortalOverview, status: PortalStatus) => {
    setMenu(null);
    if (status === "suspended" && !(await confirm(`Suspend ${p.name}? Its tour goes offline until you activate it again.`, "Suspend portal"))) return;
    const res = await fetch("/api/admin/portal-status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: p.id, status }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not change the status");
    else void reload();
  };

  const countOf = (st: PortalStatus) => portals.filter((p) => p.status === st).length;
  const filters: [Filter, string, number, string][] = [
    ["all", "All Portals", portals.length, ""],
    ["active", "Active", countOf("active"), "green"],
    ["pending", "Pending", countOf("pending"), "orange"],
    ["suspended", "Suspended", countOf("suspended"), "red"],
  ];

  return (
    <AdminShell search={q} onSearch={setQ} searchPlaceholder="Search portals, clients, cities…">
      <header className="axa-head">
        <div>
          <h1>My Portals</h1>
          <p>Manage your client portals, their branding, photos and access.</p>
        </div>
      </header>

      <div className="axa-stats">
        <article className="axa-stat blue">
          <span className="axa-stat-ico"><AiUsers /></span>
          <div><b>{totalClients}</b><small>Total Clients</small></div>
        </article>
        <article className="axa-stat violet">
          <span className="axa-stat-ico"><AiGlobe /></span>
          <div><b>{live}</b><small>Active Portals</small></div>
          <em className="axa-trend muted">of {portals.length}</em>
        </article>
        <article className="axa-stat green">
          <span className="axa-stat-ico"><AiEye /></span>
          <div><b>{fmt(visits)}</b><small>Total Visits</small></div>
          <Trend value={trend(v30, vPrev)} />
        </article>
        <article className="axa-stat orange">
          <span className="axa-stat-ico"><AiLeads /></span>
          <div><b>{fmt(leads)}</b><small>Leads</small></div>
        </article>
        <button type="button" className="axa-cta" onClick={() => setCreating(true)}>
          <AiPlus size={20} stroke={2.2} />
          Create New Portal
        </button>
      </div>

      {err && <p className="err">{err}</p>}

      <div className="axa-bar">
        <div className="axa-filters" role="tablist">
          {filters.map(([key, label, n, dot]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>
              {dot && <i className={`axa-dot ${dot}`} />}
              {label}
              <span>{n}</span>
            </button>
          ))}
        </div>
        <div className="axa-bar-right">
          <label className="axa-search small">
            <AiSearch size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search portals…" />
          </label>
          <div className="axa-toggle">
            <button type="button" className={layout === "grid" ? "on" : ""} aria-label="Grid" onClick={() => setLayout("grid")}><AiGridView size={18} /></button>
            <button type="button" className={layout === "list" ? "on" : ""} aria-label="List" onClick={() => setLayout("list")}><AiListView size={18} /></button>
          </div>
        </div>
      </div>

      {!ready && <p className="muted">Loading portals…</p>}
      {ready && !shown.length && <p className="axa-empty">{portals.length ? "No portal matches." : "No portals yet. Create the first one."}</p>}

      <div className={layout === "grid" ? "axa-cards" : "axa-rows"}>
        {shown.map((p) => (
          <article key={p.id} className="axa-card">
            <div className="axa-cover">
              {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <div className="axa-cover-empty">No cover photo yet</div>}
              <span className={`axa-pill ${STATUS[p.status].color}`}><i />{STATUS[p.status].label}</span>
              <a className="axa-open" href={`/digital-twins/${p.slug}`} target="_blank" rel="noreferrer" aria-label="Open tour"><AiExternal size={16} /></a>
            </div>
            <div className="axa-card-body">
              <span className="axa-logo-box"><Monogram p={p} /></span>
              <div className="axa-card-title">
                <b>{p.name}</b>
                <small>{p.clients.length ? p.clients.map((c) => c.name).join(", ") : "No client yet"}{p.city ? ` · ${p.city}` : ""}</small>
              </div>
              <div className="axa-card-num">
                <b>{fmt(p.visits)}</b>
                <small>Visits</small>
              </div>
            </div>
            <div className="axa-card-actions">
              <Link href={`/admin/complexes/${p.id}`}><AiGear size={16} />Manage</Link>
              <Link href={`/admin/complexes/${p.id}?tab=media`}><AiSliders size={16} />Branding</Link>
              <a href={`/digital-twins/${p.slug}`} target="_blank" rel="noreferrer"><AiEye size={16} />Preview</a>
              <span className="axa-more">
                <button type="button" aria-label="More" aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>···</button>
                {menu === p.id && (
                  <span className="axa-pop" role="menu">
                    {p.status !== "active" && <button type="button" role="menuitem" onClick={() => void setStatus(p, "active")}>Activate (tour live)</button>}
                    {p.status !== "pending" && <button type="button" role="menuitem" onClick={() => void setStatus(p, "pending")}>Set as pending</button>}
                    {p.status !== "suspended" && <button type="button" role="menuitem" className="danger" onClick={() => void setStatus(p, "suspended")}>Suspend</button>}
                    <Link role="menuitem" href={`/admin/complexes/${p.id}?tab=qr`}>Visitor QR code</Link>
                    <button type="button" role="menuitem" className="danger" onClick={() => void remove(p)}><AiTrash size={15} />Delete</button>
                  </span>
                )}
              </span>
            </div>
          </article>
        ))}
      </div>

      {creating && (
        <div className="axa-modal" onClick={() => !busy && setCreating(false)}>
          <form className="axa-modal-card stack" onClick={(e) => e.stopPropagation()} onSubmit={create}>
            <h2>New client portal</h2>
            <p className="muted">Next you add the logo, photos, villas and the client.</p>
            <label>Project name <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required placeholder="Villas Ajyad" /></label>
            <label>City <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Khamis Mushait" /></label>
            <div className="axa-modal-actions">
              <button type="button" className="btn ghost" onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="btn" disabled={busy}>{busy ? "Creating…" : "Create portal"}</button>
            </div>
          </form>
        </div>
      )}
      {dialog}
    </AdminShell>
  );
}
