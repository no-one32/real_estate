"use client";

import Link from "next/link";
import AdminShell from "../AdminShell";
import { AreaChart, BarList } from "../AdminCharts";
import { fmt, trend, usePortals } from "../usePortals";
import { ago, useAnalytics } from "../useAnalytics";
import { buildScenes360 } from "@/lib/tour";
import { Ai360, AiCube, AiEye, AiGlobe, AiLeads, AiPlus, AiUsers } from "../AdminIcons";

function Trend({ value }: { value: number | null }) {
  if (value === null) return null;
  return <em className={`axa-trend${value < 0 ? " down" : ""}`}>{value >= 0 ? "↑" : "↓"} {Math.abs(value)}%</em>;
}

export default function DashboardPage() {
  const { portals, totalClients } = usePortals();
  const { data, err } = useAnalytics(30);
  const active = portals.filter((p) => p.status === "active").length;
  const scenes = portals.reduce((n, p) => n + buildScenes360(p.scenes.map((x) => x.path)).length, 0);
  const models = portals.filter((p) => p.glb.length).length;

  return (
    <AdminShell>
      <header className="axa-head">
        <div>
          <h1>Dashboard</h1>
          <p>Everything on the platform at a glance — last 30 days.</p>
        </div>
      </header>

      <div className="axa-stats">
        <article className="axa-stat blue">
          <span className="axa-stat-ico"><AiUsers /></span>
          <div><b>{totalClients}</b><small>Total Clients</small></div>
        </article>
        <article className="axa-stat violet">
          <span className="axa-stat-ico"><AiGlobe /></span>
          <div><b>{active}</b><small>Active Portals</small></div>
          <em className="axa-trend muted">of {portals.length}</em>
        </article>
        <article className="axa-stat green">
          <span className="axa-stat-ico"><AiEye /></span>
          <div><b>{data ? fmt(data.totals.visits) : "…"}</b><small>Visits (30 days)</small></div>
          {data && <Trend value={trend(data.totals.visits, data.totals.visitsBefore)} />}
        </article>
        <article className="axa-stat orange">
          <span className="axa-stat-ico"><AiLeads /></span>
          <div><b>{data ? fmt(data.totals.leadsPeriod) : "…"}</b><small>Leads (30 days)</small></div>
        </article>
        <Link href="/admin?new=1" className="axa-cta">
          <AiPlus size={20} stroke={2.2} />
          Create New Portal
        </Link>
      </div>

      {err && <p className="err">{err}</p>}

      <div className="axa-grid-2">
        <section className="axa-panel">
          <header className="axa-panel-title">
            <h2>Visits</h2>
            <Link href="/admin/analytics" className="axa-link">Analytics →</Link>
          </header>
          {data ? <AreaChart points={data.daily} /> : <p className="muted">Loading…</p>}
        </section>
        <section className="axa-panel">
          <header className="axa-panel-title">
            <h2>Top portals</h2>
            <Link href="/admin" className="axa-link">All portals →</Link>
          </header>
          {data ? <BarList rows={data.perProject.slice(0, 6).map((p) => ({ key: p.id, label: p.name, value: p.visits }))} /> : <p className="muted">Loading…</p>}
        </section>
      </div>

      <div className="axa-grid-2">
        <section className="axa-panel">
          <header className="axa-panel-title">
            <h2>Latest leads</h2>
            <Link href="/admin/notifications" className="axa-link">See all →</Link>
          </header>
          {data && !data.recentLeads.length && <p className="axa-empty small">No leads yet.</p>}
          <ul className="axa-feed">
            {data?.recentLeads.slice(0, 6).map((l) => (
              <li key={l.id}>
                <span className="axa-avatar sm">{`${l.prenom?.[0] ?? ""}${l.nom?.[0] ?? ""}`.toUpperCase() || "?"}</span>
                <div>
                  <b>{`${l.prenom ?? ""} ${l.nom ?? ""}`.trim() || l.email}</b>
                  <small>{[l.project !== "—" ? l.project : "", l.unit_display_id ? `villa ${l.unit_display_id}` : ""].filter(Boolean).join(" · ") || "—"}</small>
                </div>
                <em>{ago(l.created_at)}</em>
              </li>
            ))}
          </ul>
        </section>
        <section className="axa-panel">
          <header className="axa-panel-title">
            <h2>Studio</h2>
          </header>
          <div className="axa-quick">
            <Link href="/admin"><span className="axa-list-ico blue"><AiGlobe size={20} /></span><b>Portals</b><small>{portals.length} portals · {totalClients} clients</small></Link>
            <Link href="/admin/tours"><span className="axa-list-ico"><Ai360 size={20} /></span><b>360° Tour Builder</b><small>{scenes} panoramas</small></Link>
            <Link href="/admin/glb"><span className="axa-list-ico orange"><AiCube size={20} /></span><b>GLB Studio</b><small>{models} projects with a 3D model</small></Link>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
