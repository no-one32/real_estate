"use client";

import { useMemo } from "react";
import type { ComplexRow, LeadRow, ProjectStats } from "@/lib/types";
import { IcBell, IcChevronDown, IcEye, IcUsersRound } from "./DashIcons";

/** Older notifications kept in the list (already read). */
const EARLIER_MAX = 30;

export type NotificationTarget =
  | { kind: "lead"; complexId: string; leadId: string }
  | { kind: "visitors"; complexId: string };

type Item = {
  key: string;
  kind: "lead" | "visitors";
  title: React.ReactNode;
  sub: string;
  at: string | null;
  unread: boolean;
  target: NotificationTarget;
};

const fmt = (n: number) => n.toLocaleString("en-US");

function ago(iso: string | null) {
  if (!iso) return "منذ زيارتك الأخيرة";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "الآن";
  if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} ساعة`;
  if (s < 86400 * 7) return `منذ ${Math.floor(s / 86400)} يوم`;
  return new Date(iso).toLocaleDateString("ar-u-nu-latn", { month: "short", day: "numeric", year: "numeric" });
}

function leadName(l: LeadRow) {
  const nom = (l.nom || "").replace(/^(السيد|السيدة|لا)\s+/, "").trim();
  return [l.prenom?.trim(), nom].filter(Boolean).join(" ") || l.email || "شخص ما";
}

export default function NotificationsView({
  complexes,
  leads,
  stats,
  onOpen,
  onReadAll,
}: {
  complexes: ComplexRow[];
  leads: LeadRow[];
  stats: Record<string, ProjectStats>;
  onOpen: (t: NotificationTarget) => void;
  onReadAll: () => void;
}) {
  const { fresh, earlier } = useMemo(() => {
    const names = new Map(complexes.map((c) => [c.id, c.name]));
    const items: Item[] = [];
    for (const c of complexes) {
      const s = stats[c.id];
      if (s?.newVisitors) {
        items.push({
          key: `v:${c.id}`,
          kind: "visitors",
          title: (
            <>
              <b>{fmt(s.newVisitors)} {s.newVisitors > 1 ? "زوار جدد" : "زائر جديد"}</b> فتحوا جولة <b>{c.name}</b>
            </>
          ),
          sub: `${c.name} · الإحصائيات`,
          at: null,
          unread: true,
          target: { kind: "visitors", complexId: c.id },
        });
      }
    }
    for (const l of leads) {
      const cid = l.complex_id || "";
      if (!names.has(cid)) continue;
      const seen = stats[cid]?.lastSeenAt;
      const unread = !seen || l.created_at > seen;
      const favs = (l.favorite_units ?? []).filter(Boolean);
      const villa = l.unit_display_id?.trim();
      items.push({
        key: `l:${l.id}`,
        kind: "lead",
        title: (
          <>
            <b>{leadName(l)}</b>
            {villa
              ? <> مهتم بـ<b>الفيلا {villa}</b></>
              : favs.length
                ? <> شارك {favs.length} {favs.length > 1 ? "فلل مفضلة" : "فيلا مفضلة"}</>
                : <> أرسل طلب تواصل</>}
          </>
        ),
        sub: `${names.get(cid)} · العملاء`,
        at: l.created_at,
        unread,
        target: { kind: "lead", complexId: cid, leadId: l.id },
      });
    }
    // visitors first (no exact time), then newest leads
    const fresh = items.filter((i) => i.unread);
    const earlier = items.filter((i) => !i.unread).slice(0, EARLIER_MAX);
    return { fresh, earlier };
  }, [complexes, leads, stats]);

  const row = (it: Item) => (
    <li key={it.key}>
      <button type="button" className={`axnt-row${it.unread ? " unread" : ""}`} onClick={() => onOpen(it.target)}>
        <span className={`axnt-ico ${it.kind}`}>
          {it.kind === "lead" ? <IcUsersRound size={20} stroke={1.8} /> : <IcEye size={20} stroke={1.8} />}
        </span>
        <span className="axnt-text">
          <span className="axnt-title">{it.title}</span>
          <span className="axnt-sub">
            {it.sub} · {ago(it.at)}
          </span>
        </span>
        {it.unread ? <span className="axnt-dot" aria-label="غير مقروء" /> : null}
        <span className="axnt-go" aria-hidden>
          <IcChevronDown size={16} stroke={2} />
        </span>
      </button>
    </li>
  );

  return (
    <section className="axd-page axnt">
      <header className="axd-head">
        <span className="axd-accent" aria-hidden="true" />
        <div className="axnt-headtext">
          <h1>الإشعارات</h1>
          <p>الزوار الجدد والمشترون المهتمون في جميع مشاريعك</p>
        </div>
        {fresh.length ? (
          <button type="button" className="axnt-readall" onClick={onReadAll}>
            تحديد الكل كمقروء
          </button>
        ) : null}
      </header>

      {!fresh.length && !earlier.length ? (
        <div className="axnt-empty">
          <span className="axnt-ico"><IcBell size={22} stroke={1.8} /></span>
          <b>لا توجد إشعارات بعد</b>
          <span>ستظهر هنا الزيارات الجديدة والمشترون المهتمون.</span>
        </div>
      ) : (
        <>
          {fresh.length ? (
            <>
              <h2 className="axnt-group">جديد <span>{fresh.length}</span></h2>
              <ul className="axnt-list">{fresh.map(row)}</ul>
            </>
          ) : null}
          {earlier.length ? (
            <>
              <h2 className="axnt-group">سابقاً</h2>
              <ul className="axnt-list">{earlier.map(row)}</ul>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
