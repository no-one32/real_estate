"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ComplexRow } from "@/lib/types";
import { exportExcel, exportPdf, type ExportTable } from "./contacts-export";
import ProjectStrip from "./ProjectStrip";
import { IcChart } from "./DashIcons";
import { Donut, HBars, LineChart, VBars, fmtDur, fmtN, type Slice } from "./AnalyticsCharts";

/* Categorical order validated for colour-blind safety (blue · green · amber · red · indigo); colour follows the source. */
const C = { blue: "#3978F6", green: "#10B981", amber: "#F59E0B", red: "#EF5362", indigo: "#7C83C9" };
const SOURCE: Record<string, { label: string; color: string }> = {
  direct: { label: "رابط مباشر", color: C.blue },
  qr: { label: "رمز QR", color: C.green },
  instagram: { label: "إنستغرام", color: C.amber },
  facebook: { label: "فيسبوك", color: C.red },
};
const DEVICE: Record<string, { label: string; color: string }> = {
  mobile: { label: "الجوال", color: "linear-gradient(90deg, #3978F6 0%, #78A5FF 100%)" },
  desktop: { label: "الكمبيوتر", color: C.green },
  tablet: { label: "الجهاز اللوحي", color: C.amber },
};

type Data = {
  period: { days: number; from: string; bucketDays: number };
  traffic: {
    sessions: number; sessionsDelta: number | null; unique: number; uniqueDelta: number | null; returning: number; returningDelta: number | null;
    sources: { key: string; n: number; pct: number }[];
    qr?: { id: string; label: string; n: number }[];
    devices: { key: string; n: number; pct: number }[];
    os: { key: string; n: number; pct: number }[];
    series: { t: string; sessions: number; unique: number }[];
    geo: { location: string; visitors: number; sessions: number; avg: number }[];
    locations: number;
    engagement: { engaged: number; returning: number; quick: number };
    recent: { visitor: string; source: string; device: string; location: string; properties: string[]; duration: number; at: string }[];
  };
  property: {
    viewedUnits: number; totalUnits: number; views: number; viewsDelta: number | null; favorites: number; favoritesDelta: number | null;
    inquiries: number; inquiryRate: number;
    units: { villa: string; model: string; mesh?: string | null; viewers: number; views: number; favorites: number; inquiries: number; avgTime: number; rate: number; level: "high" | "medium" | "low" }[];
    byModel: { model: string; avgTime: number; views: number }[];
  };
};

/** last answer per project + period, kept while the dashboard is open */
const dataCache = new Map<string, Data>();
const inflight = new Map<string, Promise<Data>>();
/** site plan per project slug (null = the project has none) */
const planCache = new Map<string, Plan | null>();

/** one request per project + period at a time; the answer goes to the cache */
function loadAnalytics(complexId: string, days: number): Promise<Data> {
  const key = `${complexId}:${days}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = fetch(`/api/client/analytics?complexId=${encodeURIComponent(complexId)}&days=${days}`)
    .then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "تعذر تحميل الإحصائيات");
      dataCache.set(key, j as Data);
      return j as Data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** start loading a project's analytics before its tab is opened (default period) */
export function prefetchAnalytics(complexId: string) {
  if (!dataCache.has(`${complexId}:30`)) void loadAnalytics(complexId, 30).catch(() => {});
}

const PERIODS: [number, string][] = [[7, "آخر 7 أيام"], [30, "شهر"], [90, "3 أشهر"], [0, "كل الفترة"]];

function Delta({ v, all }: { v: number | null; all?: boolean }) {
  if (all) return <span className="axn-delta muted">منذ إطلاق الجولة</span>;
  if (v === null) return <span className="axn-delta muted">لا توجد بيانات للفترة السابقة</span>;
  const up = v >= 0;
  return <span className={`axn-delta ${up ? "up" : "down"}`}>{up ? "↑" : "↓"} {Math.abs(v)}% مقارنة بالفترة السابقة</span>;
}

function Stat({ label, value, sub, icon, tint }: { label: string; value: ReactNode; sub: ReactNode; icon: string; tint: string }) {
  return (
    <div className="axn-stat">
      <div className="axn-stat-top">
        <span>{label}</span>
        <i style={{ background: tint }} aria-hidden="true">{icon}</i>
      </div>
      <strong>{value}</strong>
      {sub}
    </div>
  );
}

function Card({ title, sub, pill, pillTone = "blue", actions, children, className = "" }: { title: string; sub: string; pill?: ReactNode; pillTone?: "blue" | "green" | "red"; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`axn-card ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>
        {actions ?? (pill ? <span className={`axn-pill ${pillTone}`}>{pill}</span> : null)}
      </header>
      {children}
    </section>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `اليوم، ${time}`;
  if (d.toDateString() === yest.toDateString()) return `أمس، ${time}`;
  return `${d.toLocaleDateString("ar-u-nu-latn", { month: "short", day: "numeric" })}، ${time}`;
};
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** interest level, device and location names shown in Arabic */
const LEVEL: Record<string, string> = { high: "مرتفع", medium: "متوسط", low: "منخفض" };
const DEVICE_AR: Record<string, string> = { mobile: "جوال", desktop: "كمبيوتر", tablet: "جهاز لوحي" };
const place = (s: string) => (s === "Unknown" ? "غير معروف" : s);

export default function AnalyticsView({
  cx,
  complexes,
  onPick,
  tabs,
}: {
  cx: ComplexRow;
  complexes: ComplexRow[];
  onPick: (id: string) => void;
  /** project tabs when shown inside a project */
  tabs?: ReactNode;
}) {
  const [sub, setSub] = useState<"traffic" | "property">("traffic");
  const [days, setDays] = useState(30);
  // coming back to this tab: the figures already loaded show from the first frame
  const [data, setData] = useState<Data | null>(() => dataCache.get(`${cx.id}:30`) ?? null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(() => !dataCache.has(`${cx.id}:30`));
  const [picked, setPicked] = useState<string | null>(null);
  const [heatView, setHeatView] = useState<"list" | "top">("list");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const out = (e: PointerEvent) => !exportRef.current?.contains(e.target as Node) && setExportOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setExportOpen(false);
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", out);
      document.removeEventListener("keydown", key);
    };
  }, [exportOpen]);
  const [plan, setPlan] = useState<Plan | null>(() => planCache.get(cx.slug) ?? null);

  // top-view plan of the project (image + villa outlines taken from the 3D model), when there is one
  useEffect(() => {
    let alive = true;
    if (planCache.has(cx.slug)) {
      setPlan(planCache.get(cx.slug) ?? null);
      return;
    }
    setPlan(null);
    fetch(`/complexes/${cx.slug}/plan/units.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const p = j && j.units ? (j as Plan) : null;
        planCache.set(cx.slug, p);
        if (alive) setPlan(p);
      })
      .catch(() => alive && setPlan(null));
    return () => {
      alive = false;
    };
  }, [cx.slug]);
  useEffect(() => {
    if (!plan && heatView === "top") setHeatView("list");
  }, [plan, heatView]);

  useEffect(() => {
    let alive = true;
    const key = `${cx.id}:${days}`;
    // already seen (tab switch, period switch back): show it at once, refresh quietly
    const seen = dataCache.get(key);
    if (seen) setData(seen);
    setLoading(!seen);
    setErr("");
    loadAnalytics(cx.id, days)
      .then((j) => alive && setData(j))
      // a failed quiet refresh keeps the figures already on screen
      .catch((e) => alive && !seen && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [cx.id, days]);

  const t = data?.traffic;
  const p = data?.property;

  const sources: Slice[] = useMemo(() => {
    if (!t) return [];
    const out: Slice[] = [];
    let other = 0;
    for (const s of t.sources) {
      if (SOURCE[s.key]) out.push({ key: s.key, label: SOURCE[s.key].label, value: s.n, pct: s.pct, color: SOURCE[s.key].color });
      else other += s.n;
    }
    // the main sources (QR Code included) are always listed, even at 0%
    for (const k of Object.keys(SOURCE)) {
      if (!out.some((x) => x.key === k)) out.push({ key: k, label: SOURCE[k].label, value: 0, pct: 0, color: SOURCE[k].color });
    }
    if (other) out.push({ key: "other", label: "أخرى", value: other, pct: Math.round((other / Math.max(1, t.sessions)) * 1000) / 10, color: C.indigo });
    // fixed order, so a colour always means the same source
    const order = ["direct", "qr", "facebook", "instagram", "other"];
    return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [t]);

  const units = useMemo(() => [...(p?.units ?? [])].sort((a, b) => a.villa.localeCompare(b.villa, undefined, { numeric: true })), [p]);
  const selected = units.find((u) => u.villa === picked) ?? [...units].sort((a, b) => b.views - a.views)[0];
  const top = (k: "viewers" | "favorites" | "inquiries", n: number) => [...units].filter((u) => u[k] > 0).sort((a, b) => b[k] - a[k] || b.views - a.views).slice(0, n);
  const maxModel = Math.max(1, ...(p?.byModel ?? []).map((m) => m.avgTime));
  const periodLabel = days ? `عرض آخر ${days} يوماً` : "عرض كل الفترة";

  const exportAs = (format: "excel" | "pdf") => {
    setExportOpen(false);
    if (!data) return;
    const period = days ? `آخر ${days} يوماً` : "كل الفترة";
    const pdf = format === "pdf";
    const table: ExportTable =
      sub === "traffic"
        ? {
            title: `${cx.name} · الزيارات`,
            subtitle: `${period} · الزيارات ${data.period.bucketDays > 1 ? "الأسبوعية" : "اليومية"}`,
            noun: data.period.bucketDays > 1 ? "أسبوع" : "يوم",
            head: [data.period.bucketDays > 1 ? "أسبوع" : "التاريخ", "الزيارات", "الزوار الفريدون"],
            rows: data.traffic.series.map((x) => [x.t.slice(0, 10), String(x.sessions), String(x.unique)]),
            cols: [{}, { format: "number" }, { format: "number" }],
            summary: [
              { label: "الزيارات", value: fmtN(data.traffic.sessions) },
              { label: "الزوار الفريدون", value: fmtN(data.traffic.unique), tone: "blue" },
              { label: "الزوار العائدون", value: fmtN(data.traffic.returning), tone: "amber" },
              { label: "من رموز QR", value: `${data.traffic.sources.find((x) => x.key === "qr")?.pct ?? 0}%`, tone: "green" },
            ],
          }
        : {
            title: `${cx.name} · الاهتمام بالعقارات`,
            subtitle: `${period} · villas from most to least viewed`,
            noun: "فيلا",
            head: ["الفيلا", "النموذج", "الاهتمام", "المشاهدون الفريدون", "المشاهدات", "المفضلة", "الاستفسارات", pdf ? "متوسط الوقت" : "متوسط الوقت (ث)"],
            rows: [...units]
              .sort((x, y) => y.views - x.views || x.villa.localeCompare(y.villa, undefined, { numeric: true }))
              .map((u) => [u.villa, u.model, LEVEL[u.level] ?? u.level, String(u.viewers), String(u.views), String(u.favorites), String(u.inquiries), pdf ? (u.views ? fmtDur(u.avgTime) : "") : String(u.avgTime)]),
            cols: [{}, {}, { tones: { مرتفع: "green", متوسط: "amber", منخفض: "grey" } }, { format: "number" }, { format: "number" }, { format: "number" }, { format: "number" }, {}],
            summary: [
              { label: "مشاهدات الفلل", value: fmtN(data.property.views) },
              { label: "المفضلة", value: fmtN(data.property.favorites), tone: "red" },
              { label: "الاستفسارات", value: fmtN(data.property.inquiries), tone: "green" },
              { label: "الفلل التي تمت مشاهدتها", value: `${data.property.viewedUnits} / ${data.property.totalUnits}`, tone: "blue" },
            ],
          };
    if (pdf) exportPdf(table);
    else exportExcel(table);
  };

  return (
    <section className="axn">
      <header className="axn-head">
        {tabs ? <span className="axp-emblem"><IcChart size={42} stroke={2} /></span> : null}
        <div className="axn-title">
          <h1>{sub === "traffic" ? "إحصائيات الزيارات" : "إحصائيات العقارات"}</h1>
          <p>
            {sub === "traffic"
              ? "اعرف من أين يأتي الزوار وكيف يتفاعلون مع مجسمك الافتراضي."
              : "اكتشف العقارات التي تجذب الانتباه وتثير الاهتمام وتجلب الاستفسارات."}
          </p>
        </div>
        {tabs}
      </header>

      <ProjectStrip cx={cx} complexes={complexes} onPick={onPick} />

      <nav className="axn-subnav" aria-label="أقسام الإحصائيات">
        <button type="button" className={sub === "traffic" ? "on" : ""} onClick={() => setSub("traffic")}>إحصائيات الزيارات</button>
        <button type="button" className={sub === "property" ? "on" : ""} onClick={() => setSub("property")}>إحصائيات العقارات</button>
      </nav>

      <div className="axn-period">
        <span className="axn-period-label">الفترة</span>
        <div className="axn-seg" role="radiogroup" aria-label="الفترة">
          {PERIODS.map(([d, label]) => (
            <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{label}</button>
          ))}
        </div>
        <span className="axn-spacer" />
        <span className="axn-period-note">{loading ? "جارٍ التحميل…" : periodLabel}</span>
        <div className="axc-export" ref={exportRef}>
          <button type="button" className="axn-btn" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((v) => !v)} disabled={!data}>
            ↓ تصدير
          </button>
          {exportOpen ? (
            <div className="axc-pop axc-export-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => exportAs("excel")}><b className="xls">XLS</b> إكسل</button>
              <button type="button" role="menuitem" onClick={() => exportAs("pdf")}><b className="pdf">PDF</b> PDF</button>
            </div>
          ) : null}
        </div>
      </div>

      {err ? <p className="axd-err" role="alert">{err}</p> : null}

      {!data ? (
        <AnalyticsSkeleton sub={sub} />
      ) : sub === "traffic" && t ? (
        <div className={`axn-body${loading ? " stale" : ""}`}>
          <div className="axn-stats three">
            <Stat label="إجمالي الزوار" value={fmtN(t.sessions)} sub={<Delta v={t.sessionsDelta} all={!days} />} icon="♙" tint="#EAF1FF" />
            <Stat label="الزوار الفريدون" value={fmtN(t.unique)} sub={<Delta v={t.uniqueDelta} all={!days} />} icon="◎" tint="#E7FBF3" />
            <Stat label="الزوار العائدون" value={fmtN(t.returning)} sub={<Delta v={t.returningDelta} all={!days} />} icon="◷" tint="#FFF4DF" />
          </div>

          <div className="axn-row half">
            <Card title="مصادر الزيارات" sub="أين اكتشف الزوار هذا المجسم" pill={`${fmtN(t.sessions)} زيارة`}>
              {/* donut and the per-QR list side by side, so the card stays as short as Device Distribution */}
              <div className="axn-src">
                {t.sessions ? <Donut slices={sources} total={t.sessions} unit="الزيارات" /> : <p className="axn-empty">لا توجد زيارات في هذه الفترة بعد.</p>}
                <QrBox rows={t.qr ?? []} />
              </div>
              <p className="axn-note">تُحتسب الرموز المنشأة في تبويب رمز QR كلٌّ على حدة. أضف <bdi dir="ltr">?src=facebook</bdi> (أو instagram…) إلى الروابط التي تنشرها لتظهر هنا.</p>
            </Card>
            <Card title="توزيع الأجهزة" sub="الأجهزة المستخدمة لدخول الجولة الافتراضية">
              <HBars
                rows={["mobile", "desktop", "tablet"].map((k) => {
                  const d = t.devices.find((x) => x.key === k);
                  return { key: k, label: DEVICE[k].label, value: d?.pct ?? 0, max: 100, color: DEVICE[k].color, text: `${d?.pct ?? 0}%` };
                })}
              />
              {t.os.length ? <p className="axn-note">أنظمة التشغيل: {t.os.slice(0, 4).map((o) => `${o.key} ${o.pct}%`).join(" · ")}</p> : null}
            </Card>
          </div>

          <Card title="الزوار والزيارات عبر الزمن" sub={data.period.bucketDays > 1 ? "النشاط الأسبوعي خلال الفترة المحددة" : "النشاط اليومي خلال الفترة المحددة"}>
            <LineChart
              points={t.series.map((s) => ({ t: s.t, a: s.sessions, b: s.unique }))}
              labelA="الزيارات"
              labelB="الزوار الفريدون"
              colorA={C.blue}
              colorB={C.green}
              bucketDays={data.period.bucketDays}
            />
          </Card>

          <div className="axn-row wide">
            <Card title="مواقع الزوار" sub="أكثر المواقع حسب عدد الزوار" pill={`${t.locations} ${t.locations === 1 ? "موقع" : "مواقع"}`}>
              <table className="axn-table">
                <thead><tr><th>الموقع</th><th>الزوار</th><th>الزيارات</th><th>متوسط الوقت</th></tr></thead>
                <tbody>
                  {t.geo.map((g) => (
                    <tr key={g.location}><td className="strong">{place(g.location)}</td><td>{fmtN(g.visitors)}</td><td>{fmtN(g.sessions)}</td><td>{fmtDur(g.avg)}</td></tr>
                  ))}
                </tbody>
              </table>
              {!t.geo.length ? <p className="axn-empty">لا توجد زيارات في هذه الفترة بعد.</p> : null}
              {t.geo.some((g) => g.location === "Unknown") ? <p className="axn-note">تُحدَّد المواقع تقريبياً على الموقع المباشر (من مزوّد الاستضافة)؛ وتظهر «غير معروف» في الاختبارات المحلية.</p> : null}
            </Card>
            <Card title="ملخص التفاعل" sub="جودة زيارات الزوار">
              <HBars
                rows={[
                  { key: "e", label: "زيارات متفاعلة", value: t.engagement.engaged, max: 100, color: "linear-gradient(90deg, #3978F6 0%, #78A5FF 100%)", text: `${t.engagement.engaged}%` },
                  { key: "r", label: "زوار عائدون", value: t.engagement.returning, max: 100, color: C.green, text: `${t.engagement.returning}%` },
                  { key: "q", label: "خروج سريع", value: t.engagement.quick, max: 100, color: C.amber, text: `${t.engagement.quick}%` },
                ]}
              />
              <p className="axn-note">متفاعلة = بقي دقيقة أو أكثر، أو فتح فيلا. خروج سريع = غادر خلال 10 ثوانٍ دون فتح أي فيلا.</p>
            </Card>
          </div>

          <Card title="أحدث الزيارات" sub="آخر نشاط للزوار دون كشف هويتهم" pill="معرّفات زوار تحفظ الخصوصية" pillTone="green">
            <div className="axn-scroll">
              <table className="axn-table">
                <thead><tr><th>الزائر</th><th>المصدر</th><th>الجهاز</th><th>الموقع</th><th>العقارات التي شاهدها</th><th>المدة</th><th>التاريخ</th></tr></thead>
                <tbody>
                  {t.recent.map((r, i) => (
                    <tr key={`${r.visitor}-${i}`}>
                      <td className="strong"><bdi>{r.visitor}</bdi></td>
                      <td>{SOURCE[r.source]?.label ?? cap(r.source)}</td>
                      <td>{DEVICE_AR[r.device] ?? cap(r.device)}</td>
                      <td>{place(r.location)}</td>
                      <td>{r.properties.length ? r.properties.slice(0, 4).map((v) => `فيلا ${v}`).join("، ") + (r.properties.length > 4 ? ` +${r.properties.length - 4}` : "") : "—"}</td>
                      <td>{fmtDur(r.duration)}</td>
                      <td>{when(r.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!t.recent.length ? <p className="axn-empty">لا توجد زيارات في هذه الفترة بعد.</p> : null}
            </div>
          </Card>
        </div>
      ) : p ? (
        <div className={`axn-body${loading ? " stale" : ""}`}>
          <div className="axn-stats four">
            <Stat label="العقارات المشاهدة" value={<bdi dir="ltr">{fmtN(p.viewedUnits)} <small>/ {fmtN(p.totalUnits)}</small></bdi>} sub={<span className="axn-delta muted">وحدات فريدة تمت مشاهدتها</span>} icon="⌂" tint="#EAF1FF" />
            <Stat label="إجمالي مشاهدات العقارات" value={fmtN(p.views)} sub={<Delta v={p.viewsDelta} all={!days} />} icon="◉" tint="#F1EBFF" />
            <Stat label="المفضلة" value={fmtN(p.favorites)} sub={<Delta v={p.favoritesDelta} all={!days} />} icon="♡" tint="#FFEAED" />
            <Stat label="استفسارات العقارات" value={fmtN(p.inquiries)} sub={<span className="axn-delta muted">{p.inquiryRate}% من زوار المجسم</span>} icon="✉" tint="#E7FBF3" />
          </div>

          <div className="axn-row half">
            <Card title="العقارات الأكثر مشاهدة" sub="مرتبة حسب الزوار الفريدين" pill="أفضل 5">
              <RankTable rows={top("viewers", 5).map((u) => [u.villa, fmtN(u.viewers), fmtN(u.views)])} head={["المشاهدون الفريدون", "إجمالي المشاهدات"]} onPick={setPicked} />
            </Card>
            <Card title="الوحدات الأكثر إعجاباً" sub="أفضل 20 وحدة حسب المفضلة" pill="أفضل 20" pillTone="red">
              {top("favorites", 20).length ? (
                <>
                  <VBars rows={top("favorites", 20).map((u) => ({ key: u.villa, label: u.villa, value: u.favorites }))} unit="المفضلة" />
                  <p className="axn-note">الأعلى: {fmtN(top("favorites", 1)[0]?.favorites ?? 0)} إعجاب · {top("favorites", 20).length} وحدة معروضة</p>
                </>
              ) : <p className="axn-empty">لا توجد إضافات إلى المفضلة في هذه الفترة بعد.</p>}
            </Card>
          </div>

          <div className={`axn-row wide${heatView === "top" && plan ? " top-view" : ""}`}>
            <Card
              title="خريطة الاهتمام بالعقارات"
              sub="اضغط على وحدة لعرض أرقامها"
              actions={
                <div className="axn-seg small" role="radiogroup" aria-label="طريقة العرض">
                  <button type="button" role="radio" aria-checked={heatView === "list"} className={heatView === "list" ? "on" : ""} onClick={() => setHeatView("list")}>قائمة</button>
                  <button type="button" role="radio" aria-checked={heatView === "top"} className={heatView === "top" ? "on" : ""} onClick={() => setHeatView("top")} disabled={!plan} title={plan ? undefined : "لا يوجد مسقط علوي لهذا المشروع بعد"}>مسقط علوي</button>
                </div>
              }
            >
              {heatView === "top" && plan ? (
                <PlanView plan={plan} base={`/complexes/${cx.slug}/plan/`} units={units} selected={selected?.villa ?? null} onPick={setPicked} />
              ) : (
              <div className="axn-heat" role="listbox" aria-label="الفلل حسب الاهتمام">
                {units.map((u) => (
                  <button
                    key={u.villa}
                    type="button"
                    role="option"
                    aria-selected={selected?.villa === u.villa}
                    className={`axn-tile ${u.level}${selected?.villa === u.villa ? " on" : ""}`}
                    onClick={() => setPicked(u.villa)}
                    title={`فيلا ${u.villa}: ${u.views} مشاهدة، ${u.favorites} مفضلة`}
                  >
                    <b>{u.villa}</b>
                    <small>{LEVEL[u.level]}</small>
                  </button>
                ))}
              </div>
              )}
              <div className="axn-legend-row">
                <span><i style={{ background: "#34c58a" }} />اهتمام مرتفع</span>
                <span><i style={{ background: "#f5b740" }} />متوسط</span>
                <span><i style={{ background: "#c3ccda" }} />منخفض</span>
              </div>
            </Card>
            <Card
              title="العقار المحدد"
              sub={selected ? `فيلا ${selected.villa} · نموذج ${selected.model}` : "اختر فيلا من خريطة الاهتمام"}
              pill={selected ? `اهتمام ${LEVEL[selected.level]}` : undefined}
              pillTone={selected?.level === "high" ? "green" : "blue"}
            >
              {selected ? (
                <>
                  <div className="axn-selected">
                    <span>المشاهدون الفريدون</span>
                    <strong>{fmtN(selected.viewers)}</strong>
                    <small>خلال الفترة المحددة</small>
                  </div>
                  <dl className="axn-kv">
                    <dt>إجمالي المشاهدات</dt><dd>{fmtN(selected.views)}</dd>
                    <dt>المفضلة</dt><dd>{fmtN(selected.favorites)}</dd>
                    <dt>الاستفسارات</dt><dd>{fmtN(selected.inquiries)}</dd>
                    <dt>متوسط الوقت</dt><dd>{fmtDur(selected.avgTime)}</dd>
                  </dl>
                </>
              ) : <p className="axn-empty">لا توجد فلل في هذا المشروع.</p>}
            </Card>
          </div>

          <div className="axn-row half">
            <Card title="العقارات الأكثر تواصلاً" sub="الوحدات التي جلبت أكثر الاستفسارات" pill="أفضل 5" pillTone="green">
              <RankTable rows={top("inquiries", 5).map((u) => [u.villa, fmtN(u.inquiries), `${u.rate}%`])} head={["الاستفسارات", "نسبة الاستفسار"]} onPick={setPicked} />
            </Card>
            <Card title="متوسط التفاعل حسب نوع العقار" sub="متوسط الوقت الفعلي لكل وحدة تمت مشاهدتها">
              {p.byModel.some((m) => m.views) ? (
                <HBars
                  rows={p.byModel.filter((m) => m.views).slice(0, 6).map((m, i) => ({
                    key: m.model,
                    label: `نموذج ${m.model}`,
                    value: m.avgTime,
                    max: maxModel,
                    color: [C.blue, C.green, C.amber, C.red, C.indigo, C.blue][i],
                    text: fmtDur(m.avgTime),
                  }))}
                />
              ) : <p className="axn-empty">لا توجد مشاهدات للفلل في هذه الفترة بعد.</p>}
              <p className="axn-note">يُحتسب الوقت فقط أثناء فتح الفيلا وظهور الصفحة.</p>
            </Card>
          </div>
        </div>
      ) : null}

      <p className="axn-foot">AXIS Studio · الإحصائيات · بيانات زوار مجهولة الهوية</p>
    </section>
  );
}

/** The page's boxes, drawn at once with their titles while the numbers load; the real ones replace them in place. */
function AnalyticsSkeleton({ sub }: { sub: "traffic" | "property" }) {
  const bar = (h: number) => <div className="axn-skel" style={{ height: h }} />;
  const stat = (label: string, icon: string, tint: string) => (
    <Stat key={label} label={label} value={<span className="axn-skel num" />} sub={<span className="axn-skel line" />} icon={icon} tint={tint} />
  );
  if (sub === "traffic")
    return (
      <div className="axn-body" aria-busy="true" aria-label="جارٍ تحميل الإحصائيات">
        <div className="axn-stats three">
          {stat("إجمالي الزوار", "♙", "#EAF1FF")}
          {stat("الزوار الفريدون", "◎", "#E7FBF3")}
          {stat("الزوار العائدون", "◷", "#FFF4DF")}
        </div>
        <div className="axn-row half">
          <Card title="مصادر الزيارات" sub="أين اكتشف الزوار هذا المجسم">{bar(200)}</Card>
          <Card title="توزيع الأجهزة" sub="الأجهزة المستخدمة لدخول الجولة الافتراضية">{bar(200)}</Card>
        </div>
        <Card title="الزوار والزيارات عبر الزمن" sub="النشاط خلال الفترة المحددة">{bar(240)}</Card>
        <div className="axn-row wide">
          <Card title="مواقع الزوار" sub="أكثر المواقع حسب عدد الزوار">{bar(160)}</Card>
          <Card title="ملخص التفاعل" sub="جودة زيارات الزوار">{bar(160)}</Card>
        </div>
        <Card title="أحدث الزيارات" sub="آخر نشاط للزوار دون كشف هويتهم">{bar(180)}</Card>
      </div>
    );
  return (
    <div className="axn-body" aria-busy="true" aria-label="جارٍ تحميل الإحصائيات">
      <div className="axn-stats four">
        {stat("العقارات المشاهدة", "⌂", "#EAF1FF")}
        {stat("إجمالي مشاهدات العقارات", "◉", "#F1EBFF")}
        {stat("المفضلة", "♡", "#FFEAED")}
        {stat("استفسارات العقارات", "✉", "#E7FBF3")}
      </div>
      <div className="axn-row half">
        <Card title="العقارات الأكثر مشاهدة" sub="مرتبة حسب الزوار الفريدين">{bar(200)}</Card>
        <Card title="الوحدات الأكثر إعجاباً" sub="أفضل 20 وحدة حسب المفضلة">{bar(200)}</Card>
      </div>
      <div className="axn-row wide">
        <Card title="خريطة الاهتمام بالعقارات" sub="اضغط على وحدة لعرض أرقامها">{bar(260)}</Card>
        <Card title="العقار المحدد" sub="اختر فيلا من خريطة الاهتمام">{bar(260)}</Card>
      </div>
      <div className="axn-row half">
        <Card title="العقارات الأكثر تواصلاً" sub="الوحدات التي جلبت أكثر الاستفسارات">{bar(180)}</Card>
        <Card title="متوسط التفاعل حسب نوع العقار" sub="متوسط الوقت الفعلي لكل وحدة تمت مشاهدتها">{bar(180)}</Card>
      </div>
    </div>
  );
}

function RankTable({ rows, head, onPick }: { rows: [string, string, string][]; head: [string, string]; onPick: (villa: string) => void }) {
  if (!rows.length) return <p className="axn-empty">لا شيء في هذه الفترة بعد.</p>;
  return (
    <table className="axn-table">
      <thead><tr><th>الترتيب</th><th>العقار</th><th>{head[0]}</th><th>{head[1]}</th></tr></thead>
      <tbody>
        {rows.map(([villa, a, b], i) => (
          <tr key={villa} className="clickable" onClick={() => onPick(villa)}>
            <td>{String(i + 1).padStart(2, "0")}</td>
            <td className="strong">فيلا {villa}</td>
            <td>{a}</td>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Plan = { image: string; width: number; height: number; units: Record<string, [number, number][]> };
type HeatUnit = Data["property"]["units"][number];

const HEAT: Record<HeatUnit["level"], string> = { high: "#34c58a", medium: "#f5b740", low: "#c3ccda" };

/** Site plan seen from above; each villa outline comes from the 3D model and is coloured by interest. */
function PlanView({ plan, base, units, selected, onPick }: { plan: Plan; base: string; units: HeatUnit[]; selected: string | null; onPick: (villa: string) => void }) {
  const byMesh = useMemo(() => new Map(units.filter((u) => u.mesh).map((u) => [u.mesh as string, u])), [units]);
  const [hover, setHover] = useState<{ u: HeatUnit; d: string } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; flip: boolean } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const entries = Object.entries(plan.units);
  // the tooltip follows the cursor; it flips to the left near the right edge
  const move = (e: React.MouseEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const z = r.width / (boxRef.current?.offsetWidth || r.width) || 1; // dashboard is drawn with CSS zoom
    const x = (e.clientX - r.left) / z;
    const y = (e.clientY - r.top) / z;
    setPos({ x, y, flip: x > r.width / z - 220 });
  };
  return (
    <div
      ref={boxRef}
      className={`axn-plan${hover ? " hovering" : ""}`}
      onMouseMove={move}
      onMouseLeave={() => {
        setHover(null);
        setPos(null);
      }}
    >
      <svg viewBox={`0 0 ${plan.width} ${plan.height}`} role="listbox" aria-label="الفلل على المخطط">
        <defs>
          <filter id="axn-plan-lift" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2.2" floodColor="#0b1220" floodOpacity="0.35" />
          </filter>
        </defs>
        <image href={`${base}${plan.image}`} x={0} y={0} width={plan.width} height={plan.height} preserveAspectRatio="none" />
        {entries.map(([mesh, pts]) => {
          const u = byMesh.get(mesh);
          const d = `M${pts.map((p) => p.join(",")).join("L")}Z`;
          if (!u) return <path key={mesh} d={d} className="axn-plan-off" />;
          const on = selected === u.villa;
          return (
            <path
              key={mesh}
              d={d}
              role="option"
              aria-selected={on}
              aria-label={`فيلا ${u.villa}، اهتمام ${LEVEL[u.level]}`}
              tabIndex={0}
              className={`axn-plan-unit${on ? " on" : ""}`}
              fill={HEAT[u.level]}
              onClick={() => onPick(u.villa)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(u.villa)}
              onMouseEnter={() => setHover({ u, d })}
              onFocus={() => setHover({ u, d })}
              onBlur={() => setHover(null)}
            />
          );
        })}
        {(() => {
          const sel = entries.find(([mesh]) => byMesh.get(mesh)?.villa === selected);
          return sel ? <path d={`M${sel[1].map((p) => p.join(",")).join("L")}Z`} className="axn-plan-sel" /> : null;
        })()}
        {/* the hovered villa drawn again on top: full colour, dark outline, soft shadow */}
        {hover ? <path d={hover.d} className="axn-plan-hl" fill={HEAT[hover.u.level]} filter="url(#axn-plan-lift)" /> : null}
      </svg>
      {hover ? (
        <div
          className={`axn-plan-tip${pos ? " follow" : ""}${pos?.flip ? " flip" : ""}`}
          style={pos ? { left: pos.x, top: pos.y } : undefined}
        >
          <span className="axn-plan-tip-head">
            <b>فيلا {hover.u.villa}</b>
            <span className={`axn-plan-lvl ${hover.u.level}`}>
              <i style={{ background: HEAT[hover.u.level] }} />
              {hover.u.level === "high" ? "اهتمام مرتفع" : hover.u.level === "medium" ? "متوسط" : "منخفض"}
            </span>
          </span>
          <span className="axn-plan-tip-stats">
            <span><b>{fmtN(hover.u.views)}</b> مشاهدة</span>
            <span><b>{fmtN(hover.u.favorites)}</b> مفضلة</span>
            <span><b>{fmtN(hover.u.inquiries)}</b> استفسار</span>
          </span>
          {hover.u.model ? <span className="axn-plan-tip-model">نموذج {hover.u.model}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Small box under the sources donut: visits brought by each QR code. */
function QrBox({ rows }: { rows: { id: string; label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((n, r) => n + r.n, 0);
  return (
    <div className="axn-qrbox">
      <div className="axn-qrbox-head">
        <b>الزيارات حسب رمز QR</b>
        <span>{fmtN(total)} إجمالاً</span>
      </div>
      {rows.length ? (
        <ul>
          {rows.map((r, i) => (
            <li key={r.id} title={`${r.label}: ${r.n} زيارة`}>
              <span className="axn-qrbox-tag">QR{i + 1}</span>
              <span className="axn-qrbox-name">{r.label}</span>
              <span className="axn-qrbox-bar"><i style={{ width: `${r.n ? Math.max(3, (r.n / max) * 100) : 0}%` }} /></span>
              <b>{fmtN(r.n)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p>لا توجد رموز QR بعد. أنشئ رمزاً في تبويب رمز QR لمتابعة عمليات المسح هنا.</p>
      )}
    </div>
  );
}
