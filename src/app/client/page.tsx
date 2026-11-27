"use client";

import { useEffect, useMemo, useState } from "react";
import ClientShell, { type ClientView } from "./ClientShell";
import ContactsView, { buildContacts } from "./ContactsView";
import type { SearchHit } from "./GlobalSearch";
import { priceOf } from "./ApartmentsView";
import ApartmentsView from "./ApartmentsView";
import QrView from "./QrView";
import AnalyticsView, { prefetchAnalytics } from "./AnalyticsView";
import AssistantView from "./AssistantView";
import HelpView from "./HelpView";
import NotificationsView, { type NotificationTarget } from "./NotificationsView";
import { IcBuilding, IcCalendar, IcChart, IcClock, IcDoor, IcEye, IcHandshake, IcPin, IcQr, IcUsers } from "./DashIcons";
import type { ComplexRow, LeadRow, ProjectStats, UnitRow } from "@/lib/types";
import { displayPersonName } from "@/lib/person-name";

const fmt = (n: number) => n.toLocaleString("en-US");

type ProjectTab = "apartments" | "qr" | "analytics" | "contacts";

/** Pill tabs at the top right of a project page. */
function ProjectTabs({ tab, onTab }: { tab: ProjectTab; onTab: (t: ProjectTab) => void }) {
  const items: [ProjectTab, string, React.ReactNode][] = [
    ["apartments", "الوحدات", <IcDoor key="d" size={16} stroke={1.6} />],
    ["analytics", "الإحصائيات", <IcChart key="c" size={17} stroke={1.8} />],
    ["contacts", "العملاء", <IcUsers key="u" size={17} stroke={2} />],
    ["qr", "رمز QR", <IcQr key="q" size={17} stroke={1.7} />],
  ];
  return (
    <nav className="axp-tabs" aria-label="أقسام المشروع">
      {items.map(([key, label, icon]) => (
        <button key={key} type="button" className={tab === key ? "on" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => onTab(key)}>
          {icon}
          {label}
        </button>
      ))}
    </nav>
  );
}
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("ar-u-nu-latn", { month: "long", day: "numeric", year: "numeric" }) : "";

function ProjectCard({
  cx,
  stats,
  cover,
  units,
  onOpen,
}: {
  cx: ComplexRow;
  stats?: ProjectStats;
  cover?: string;
  units: UnitRow[];
  onOpen: () => void;
}) {
  const sold = units.filter((u) => u.status === "sold").length;
  const reserved = units.filter((u) => u.status === "reserved").length;
  const available = units.filter((u) => u.status === "available").length;
  const badge = stats?.badge ?? 0;
  return (
    <button type="button" className="axd-card" onClick={onOpen} aria-label={`فتح ${cx.name}`}>
      {badge > 0 ? (
        <span className="axd-badge" title={`${stats?.newVisitors ?? 0} زائر جديد، ${stats?.newLeads ?? 0} مهتم جديد`}>
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <span className="axd-card-photo">
        {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : null}
      </span>
      <span className="axd-card-row">
        <span className="axd-cat"><IcBuilding size={28} stroke={2.1} /></span>
        <span className="axd-visitors">
          <IcEye size={17} />
          <span>{fmt(stats?.visitors ?? 0)} زائر</span>
          {stats?.newVisitors ? <b>(+{fmt(stats.newVisitors)} جديد)</b> : null}
        </span>
      </span>
      <span className="axd-card-name">{cx.name}</span>
      {cx.description ? <span className="axd-card-desc">{cx.description}</span> : null}
      <span className="axd-card-meta">
        {cx.city ? (
          <span><IcPin size={20} stroke={2.4} />{cx.city}</span>
        ) : null}
        {cx.created_at ? (
          <span><IcCalendar size={20} stroke={2.4} />{fmtDate(cx.created_at)}</span>
        ) : null}
      </span>
      <span className="axd-pills">
        <span className="axd-pill sold">{fmt(sold)} فيلا مباعة</span>
        <span className="axd-pill reserved">{fmt(reserved)} فيلا محجوزة</span>
        <span className="axd-pill available">{fmt(available)} فيلا متاحة</span>
      </span>
    </button>
  );
}

function NextProjectCard() {
  return (
    <div className="axd-next" aria-label="نتطلع إلى مشروعنا القادم">
      <span className="axd-next-glow a" />
      <span className="axd-next-glow b" />
      {/* the design's corner art, mirrored for Arabic (measured on the design): two thin faint arc lines,
          a soft blue fill against the side edge, and a thin blue crescent that reaches the side ~60% down */}
      <svg className="axd-next-deco" viewBox="0 0 528 240" preserveAspectRatio="xMinYMax meet" aria-hidden="true">
        <defs>
          <linearGradient id="axdArcFill" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#E3EBFF" stopOpacity="0" />
            <stop offset="1" stopColor="#C9D9FF" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="axdRibbon" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#C9D9FF" stopOpacity="0" />
            <stop offset="0.45" stopColor="#8FB0FF" />
            <stop offset="0.8" stopColor="#5B8DFF" />
            <stop offset="1" stopColor="#9DBBFF" />
          </linearGradient>
        </defs>
        {/* outer arc: a thin faint line only */}
        <path d="M172 240C172 130 100 45 0 39" stroke="#D6E2FF" strokeOpacity="0.8" strokeWidth="0.8" fill="none" />
        {/* inner arc: soft fill, bluer against the side edge */}
        <path d="M105 240V178C105 135 60 90 0 82V240Z" fill="url(#axdArcFill)" />
        <path d="M105 240V178C105 135 60 90 0 82" stroke="#fff" strokeOpacity="0.9" strokeWidth="0.8" fill="none" />
        {/* the blue crescent, its tip fading into a faint line toward the bottom */}
        <path d="M161 220Q70 206 0 139V163Q62 214 161 220Z" fill="url(#axdRibbon)" />
        <path d="M161 220Q205 226 250 236" stroke="#C9D9FF" strokeOpacity="0.7" strokeWidth="0.8" fill="none" />
      </svg>

      <span className="axd-next-icon"><IcHandshake size={30} stroke={1.8} /></span>
      {/* same split as the design: "Looking Forward / to Our Next Project", the last words in light blue, underlined */}
      <h2 className="axd-next-title">
        نتطلع بشغف
        <br />
        إلى <span className="blue">مشروعنا <span className="underlined">القادم</span></span>
      </h2>
      <p className="axd-next-text">
        نحن هنا دائماً ومتحمسون للعمل معك مجدداً
        <br />
        في مشروعك القادم.
      </p>
      <span className="axd-next-callout">
        <IcClock size={16} stroke={1.8} />
        <i aria-hidden="true" />
        لنصنع معاً شيئاً رائعاً.
      </span>
    </div>
  );
}

/** Arabic names of the projects (keys in lower case, as saved in the database) */
const AR_PROJECT_NAME: Record<string, string> = {
  "villas ajyad": "فيلات أجياد",
};

/** City shown next to the date when the project has none saved (keys = English project name, lower case) */
const AR_PROJECT_CITY: Record<string, string> = {
  "villas ajyad": "خميس مشيط",
};

/** Arabic names of cities typed in English in the database */
const AR_CITY: Record<string, string> = {
  "khamis mushait": "خميس مشيط",
  abha: "أبها",
  riyadh: "الرياض",
  jeddah: "جدة",
  dammam: "الدمام",
  najran: "نجران",
  jazan: "جازان",
  mecca: "مكة المكرمة",
  makkah: "مكة المكرمة",
  medina: "المدينة المنورة",
  madinah: "المدينة المنورة",
};

function arabicCity(c: ComplexRow) {
  const city = c.city?.trim();
  if (city) return AR_CITY[city.toLowerCase()] ?? city;
  return AR_PROJECT_CITY[c.name.trim().toLowerCase()] ?? null;
}

export default function ClientHome() {
  const [complexes, setComplexes] = useState<ComplexRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [stats, setStats] = useState<Record<string, ProjectStats>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string>("");
  const [view, setView] = useState<ClientView>("projects");
  const [projectTab, setProjectTab] = useState<ProjectTab>("apartments");
  /** row to show after a "Search anything" pick (n changes on every pick) */
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  /** set when an admin entered this client's portal from the admin */
  const [viewAs, setViewAs] = useState<{ adminName: string } | null>(null);
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = async () => {
    const res = await fetch("/api/client/dashboard");
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "تعذر التحميل");
      setReady(true);
      return;
    }
    setName(json.profile?.full_name || "");
    setEmail(json.profile?.email || "");
    setAvatar(json.profile?.avatar_url || null);
    setViewAs(json.viewAs ?? null);
    // the dashboard is in Arabic: show the project names in Arabic too
    setComplexes(((json.complexes ?? []) as ComplexRow[]).map((c) => ({ ...c, city: arabicCity(c), name: AR_PROJECT_NAME[c.name.trim().toLowerCase()] ?? c.name })));
    setUnits(json.units ?? []);
    setLeads(json.leads ?? []);
    setStats(json.stats ?? {});
    setCovers(json.covers ?? {});
    setActive((prev) => prev || json.complexes?.[0]?.id || "");
    setReady(true);
  };

  useEffect(() => {
    void load();
  }, []);

  const notifications = useMemo(() => Object.values(stats).reduce((n, s) => n + s.badge, 0), [stats]);

  /** the owner has now seen everything new on this project (badge, "+N new", notifications) */
  const markSeen = (complexId: string) => {
    setStats((prev) => {
      const s = prev[complexId];
      return s ? { ...prev, [complexId]: { ...s, badge: 0, newVisitors: 0, newLeads: 0, lastSeenAt: new Date().toISOString() } } : prev;
    });
    void fetch("/api/client/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId }),
    });
  };

  const openProject = (cx: ComplexRow) => {
    setActive(cx.id);
    setView("project");
    setProjectTab("apartments");
    markSeen(cx.id);
  };

  /** a notification was clicked: go to the right place inside its project */
  const openNotification = (t: NotificationTarget) => {
    setActive(t.complexId);
    setView("project");
    if (t.kind === "lead") {
      setProjectTab("contacts");
      setFocus({ id: t.leadId, n: Date.now() });
    } else {
      setProjectTab("analytics");
      setFocus(null);
    }
    if (stats[t.complexId]?.badge) markSeen(t.complexId);
  };

  const readAll = () => {
    for (const c of complexes) if (stats[c.id]?.badge || stats[c.id]?.newVisitors) markSeen(c.id);
  };

  const cx = complexes.find((c) => c.id === active) || complexes[0] || null;
  // a project is open: load its analytics in the background, so the Analytics tab shows at once
  useEffect(() => {
    if (view === "project" && cx) prefetchAnalytics(cx.id);
  }, [view, cx?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // manual navigation forgets the row picked in "Search anything"
  const pickView = (v: ClientView) => {
    setFocus(null);
    setView(v);
  };
  const pickTab = (t: ProjectTab) => {
    setFocus(null);
    setProjectTab(t);
  };

  const searchItems = useMemo<SearchHit[]>(() => {
    const items: SearchHit[] = [];
    const goProject = (c: ComplexRow, tab: ProjectTab) => () => {
      setActive(c.id);
      setView("project");
      setProjectTab(tab);
    };
    items.push(
      { key: "p:projects", group: "Pages", title: "مشاريعي", terms: ["home", "projects", "dashboard", "الرئيسية", "المشاريع"], go: () => setView("projects") },
      { key: "p:contacts", group: "Pages", title: "جميع العملاء", terms: ["leads", "clients", "contacts", "interested", "العملاء", "المهتمين"], go: () => setView("contacts") },
      { key: "p:analytics", group: "Pages", title: "الإحصائيات", terms: ["stats", "statistics", "charts", "analytics", "إحصائيات", "زوار"], go: () => setView("analytics") },
      { key: "p:notifications", group: "Pages", title: "الإشعارات", terms: ["alerts", "new", "notifications", "إشعارات", "تنبيهات"], go: () => setView("notifications") },
      { key: "p:assistant", group: "Pages", title: "المساعد", terms: ["ai", "chat", "ask", "assistant", "مساعد", "سؤال"], go: () => setView("assistant") },
      { key: "p:help", group: "Pages", title: "مركز المساعدة", terms: ["help", "faq", "support", "مساعدة", "دليل"], go: () => setView("help") },
    );
    const label: Record<ProjectTab, [string, string[]]> = {
      apartments: ["الوحدات", ["villas", "units", "prices", "status", "فلل", "أسعار"]],
      qr: ["رمز QR", ["qr", "code", "scan", "print", "رمز"]],
      analytics: ["الإحصائيات", ["stats", "interest", "analytics", "إحصائيات"]],
      contacts: ["العملاء", ["leads", "clients", "contacts", "عملاء"]],
    };
    for (const c of complexes) {
      items.push({
        key: `c:${c.id}`,
        group: "Projects",
        title: c.name,
        sub: [c.description, c.city].filter(Boolean).join(" · ") || undefined,
        terms: [c.slug],
        go: () => openProject(c),
      });
      for (const tab of Object.keys(label) as ProjectTab[]) {
        items.push({
          key: `t:${c.id}:${tab}`,
          group: "Pages",
          title: `${c.name} · ${label[tab][0]}`,
          terms: label[tab][1],
          go: goProject(c, tab),
        });
      }
    }
    const names = new Map(complexes.map((c) => [c.id, c]));
    for (const u of units) {
      const c = names.get(u.complex_id);
      if (!c) continue;
      const model = u.model || `${u.type}A`;
      const status = u.status === "available" ? "متاحة" : u.status === "reserved" ? "محجوزة" : "مباعة";
      items.push({
        key: `u:${u.id}`,
        group: "Villas",
        title: `فيلا ${u.display_id}`,
        sub: `${c.name} · نموذج ${model} · ${status} · ${priceOf(u).toLocaleString("en-US")} ر.س`,
        terms: [String(priceOf(u)), `${u.rooms} bed`, `${u.surface} m2`, `villa ${u.display_id}`, "فيلا"],
        go: () => {
          goProject(c, "apartments")();
          setFocus({ id: u.id, n: Date.now() });
        },
      });
    }
    for (const ct of buildContacts(leads, complexes)) {
      items.push({
        key: `l:${ct.key}`,
        group: "Contacts",
        title: ct.name || ct.email || "عميل",
        sub: [ct.email, ct.project].filter(Boolean).join(" · "),
        terms: [ct.phone, ct.note, ...ct.villas.map((v) => `villa ${v}`), ...ct.villas.map((v) => `فيلا ${v}`)],
        go: () => {
          setView("contacts");
          setFocus({ id: ct.key, n: Date.now() });
        },
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexes, units, leads]);

  return (
    <ClientShell
      searchItems={searchItems}
      view={view}
      onView={pickView}
      notifications={notifications}
      name={displayPersonName(name, email) || name}
      avatarUrl={avatar}
      onAvatar={setAvatar}
      viewAs={viewAs}
    >
      {view === "projects" ? (
        <section className="axd-page">
          <header className="axd-head">
            <span className="axd-accent" aria-hidden="true" />
            <div>
              <h1>مشاريعي</h1>
              <p>اختر مشروعاً لإدارة الوحدات وعرض الإحصائيات</p>
            </div>
          </header>
          {err ? <p className="axd-err">{err}</p> : null}
          {!ready ? (
            <p className="axd-muted">جارٍ التحميل…</p>
          ) : (
            <div className="axd-grid">
              {complexes.map((c) => (
                <ProjectCard
                  key={c.id}
                  cx={c}
                  stats={stats[c.id]}
                  cover={covers[c.id]}
                  units={units.filter((u) => u.complex_id === c.id)}
                  onOpen={() => openProject(c)}
                />
              ))}
              <NextProjectCard />
            </div>
          )}
        </section>
      ) : view === "notifications" ? (
        <NotificationsView complexes={complexes} leads={leads} stats={stats} onOpen={openNotification} onReadAll={readAll} />
      ) : view === "help" ? (
        <HelpView onView={pickView} />
      ) : view === "assistant" ? (
        <AssistantView />
      ) : view === "contacts" ? (
        <ContactsView leads={leads} units={units} complexes={complexes} onLeads={setLeads} focus={focus} />
      ) : view === "project" && cx && projectTab === "contacts" ? (
        <ContactsView
          leads={leads}
          units={units}
          complexes={complexes}
          onLeads={setLeads}
          scope={cx}
          focus={focus}
          tabs={<ProjectTabs tab={projectTab} onTab={pickTab} />}
        />
      ) : view === "project" && cx && projectTab === "apartments" ? (
        <ApartmentsView cx={cx} units={units} onUnits={setUnits} focus={focus} tabs={<ProjectTabs tab={projectTab} onTab={pickTab} />} />
      ) : view === "project" && cx && projectTab === "qr" ? (
        <QrView cx={cx} complexes={complexes} onPick={setActive} tabs={<ProjectTabs tab={projectTab} onTab={pickTab} />} />
      ) : view === "project" && cx ? (
        <AnalyticsView cx={cx} complexes={complexes} onPick={setActive} tabs={<ProjectTabs tab={projectTab} onTab={pickTab} />} />
      ) : cx ? (
        <AnalyticsView cx={cx} complexes={complexes} onPick={setActive} />
      ) : (
        <section className="axd-page">
          <p className="axd-muted">{ready ? "لا يوجد مشروع مرتبط بهذا الحساب بعد." : "جارٍ التحميل…"}</p>
        </section>
      )}
    </ClientShell>
  );
}
