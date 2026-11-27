"use client";

import { useState } from "react";
import AdminShell from "../AdminShell";
import { AreaChart, BarList } from "../AdminCharts";
import { fmt, trend } from "../usePortals";
import { DEVICE_LABEL, SOURCE_LABEL, duration, useAnalytics } from "../useAnalytics";
import { AiChart, AiEye, AiLeads } from "../AdminIcons";

function Trend({ value }: { value: number | null }) {
  if (value === null) return null;
  return <em className={`axa-trend${value < 0 ? " down" : ""}`}>{value >= 0 ? "↑" : "↓"} {Math.abs(value)}%</em>;
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, err } = useAnalytics(days);
  const total = data?.totals.visits ?? 0;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

  return (
    <AdminShell>
      <header className="axa-head axa-head-row">
        <div>
          <h1>Analytics</h1>
          <p>Visits and leads over every portal.</p>
        </div>
        <div className="axa-filters" role="tablist" aria-label="Period">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" role="tab" aria-selected={days === d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </header>

      {err && <p className="err">{err}</p>}

      <div className="axa-stats three">
        <article className="axa-stat green">
          <span className="axa-stat-ico"><AiEye /></span>
          <div><b>{data ? fmt(data.totals.visits) : "…"}</b><small>Visits</small></div>
          {data && <Trend value={trend(data.totals.visits, data.totals.visitsBefore)} />}
        </article>
        <article className="axa-stat orange">
          <span className="axa-stat-ico"><AiLeads /></span>
          <div><b>{data ? fmt(data.totals.leadsPeriod) : "…"}</b><small>Leads</small></div>
          {data && <em className="axa-trend muted">{fmt(data.totals.leads)} in total</em>}
        </article>
        <article className="axa-stat violet">
          <span className="axa-stat-ico"><AiChart /></span>
          <div><b>{data ? duration(data.totals.avgSeconds) : "…"}</b><small>Average time on a tour</small></div>
        </article>
      </div>

      <section className="axa-panel">
        <header className="axa-panel-title"><h2>Visits per day</h2></header>
        {data ? <AreaChart points={data.daily} height={260} /> : <p className="muted">Loading…</p>}
      </section>

      <div className="axa-grid-2">
        <section className="axa-panel">
          <header className="axa-panel-title"><h2>Where visitors come from</h2></header>
          {data && <BarList rows={data.sources.map((s) => ({ key: s.key, label: SOURCE_LABEL[s.key] ?? s.key, value: s.count, text: `${s.count} · ${pct(s.count)}` }))} />}
        </section>
        <section className="axa-panel">
          <header className="axa-panel-title"><h2>Devices</h2></header>
          {data && <BarList color="#7c5cff" rows={data.devices.map((s) => ({ key: s.key, label: DEVICE_LABEL[s.key] ?? s.key, value: s.count, text: `${s.count} · ${pct(s.count)}` }))} />}
        </section>
      </div>

      <section className="axa-panel">
        <header className="axa-panel-title"><h2>Portals</h2></header>
        <div className="axa-table flat">
          <div className="axa-tr axa-th cols-4">
            <span>Portal</span>
            <span>Visits</span>
            <span>vs previous {days} days</span>
            <span>Average time</span>
          </div>
          {data?.perProject.map((p) => {
            const t = trend(p.visits, p.before);
            return (
              <div key={p.id} className="axa-tr cols-4">
                <span className="axa-td-project"><b>{p.name}</b></span>
                <span>{fmt(p.visits)}</span>
                <span>{t === null ? "—" : <em className={`axa-trend inline${t < 0 ? " down" : ""}`}>{t >= 0 ? "↑" : "↓"} {Math.abs(t)}%</em>}</span>
                <span>{duration(p.avgSeconds)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </AdminShell>
  );
}
