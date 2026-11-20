"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { exportExcel, exportPdf, type ExportTable } from "./contacts-export";
import { toUi, uiScale } from "./ui-scale";
import DashSelect from "./DashSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import type { ComplexRow, LeadRow, LeadStatus, UnitRow } from "@/lib/types";
import {
  IcArrowLeft,
  IcArrowRight,
  IcChevronDown,
  IcExport,
  IcFilter,
  IcRotate,
  IcSearch,
  IcSortFlipped,
  IcSortNone,
  IcTrash,
  IcUsersRound,
  IcX,
} from "./DashIcons";

const PAGE = 10;
const NOTE_PREVIEW = 18;

const STATUS_LABEL: Record<LeadStatus, string> = { new: "جديد", in_progress: "قيد المتابعة", sold: "تم البيع" };
const STATUS_ORDER: LeadStatus[] = ["new", "in_progress", "sold"];

/* the tour's contact form stores the Arabic title */
const GENDER: Record<string, string> = { "السيد": "السيد", "السيدة": "السيدة", "لا": "—" };

/** One person per project: all their requests merged into a single line. */
export type Contact = {
  key: string;
  leadIds: string[];
  name: string;
  initials: string;
  gender: string;
  email: string;
  phone: string;
  note: string;
  /** villa numbers: the one they asked about first, then the ones they liked */
  villas: string[];
  complexId: string;
  project: string;
  date: string;
  status: LeadStatus;
};

type SortKey = "name" | "gender" | "email" | "phone" | "note" | "model" | "project" | "date" | "status";
type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ar-u-nu-latn", { month: "short", day: "numeric", year: "numeric" });

function personName(l: LeadRow) {
  let nom = (l.nom || "").trim();
  // older rows carry the title in front of the last name ("السيد Karim")
  for (const t of Object.keys(GENDER)) if (nom.startsWith(`${t} `)) nom = nom.slice(t.length + 1).trim();
  return [l.prenom?.trim(), nom].filter(Boolean).join(" ");
}

function initialsOf(name: string) {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function buildContacts(leads: LeadRow[], complexes: ComplexRow[]): Contact[] {
  const names = new Map(complexes.map((c) => [c.id, c.name]));
  const byKey = new Map<string, Contact>();
  // leads arrive newest first: the first one seen gives the current status / date / note
  for (const l of leads) {
    const cid = l.complex_id || "";
    const key = `${cid}|${(l.email || l.id).trim().toLowerCase()}`;
    let c = byKey.get(key);
    if (!c) {
      const name = personName(l);
      c = {
        key,
        leadIds: [],
        name,
        initials: initialsOf(name),
        gender: GENDER[(l.gender || "").trim()] || "—",
        email: l.email || "",
        phone: l.tel && l.tel !== "-" ? l.tel : "",
        note: "",
        villas: [],
        complexId: cid,
        project: names.get(cid) || l.complex_slug || "",
        date: l.created_at,
        status: (l.status as LeadStatus) || "new",
      };
      byKey.set(key, c);
    }
    c.leadIds.push(l.id);
    if (!c.note) c.note = (l.message || l.subject || "").trim();
    for (const v of [l.unit_display_id, ...(l.favorite_units ?? [])]) {
      const id = (v || "").trim();
      if (id && !c.villas.includes(id)) c.villas.push(id);
    }
  }
  return [...byKey.values()];
}

type Pop = { key: string; x: number; y: number };

export default function ContactsView({
  leads,
  units,
  complexes,
  onLeads,
  scope,
  tabs,
  focus,
}: {
  leads: LeadRow[];
  units: UnitRow[];
  complexes: ComplexRow[];
  onLeads: (next: (prev: LeadRow[]) => LeadRow[]) => void;
  /** set inside a project: only its contacts, no Project column / filter */
  scope?: ComplexRow | null;
  /** project tabs (Apartments / Analytics / Contacts) shown in the header */
  tabs?: ReactNode;
  /** from "Search anything": show this contact (clears filters, opens its page, flashes the row) */
  focus?: { id: string; n: number } | null;
}) {
  const { confirm, dialog } = useConfirm({ cancel: "إلغاء", ok: "تأكيد", title: "هل أنت متأكد؟" });
  const [q, setQ] = useState("");
  const [project, setProject] = useState("");
  const [status, setStatus] = useState<"" | LeadStatus>("");
  const [range, setRange] = useState<"" | "7" | "30" | "90">("");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [notePop, setNotePop] = useState<Pop | null>(null);
  const [statusPop, setStatusPop] = useState<Pop | null>(null);
  const [err, setErr] = useState("");
  const popRef = useRef<HTMLDivElement>(null);

  const model = useMemo(() => {
    const map = new Map(units.map((u) => [`${u.complex_id}|${u.display_id.toLowerCase()}`, u]));
    return (complexId: string, villa: string) => {
      const u = map.get(`${complexId}|${villa.toLowerCase()}`);
      return u ? u.model || `T${u.type}` : "";
    };
  }, [units]);

  const contacts = useMemo(
    () => buildContacts(scope ? leads.filter((l) => l.complex_id === scope.id) : leads, complexes),
    [leads, complexes, scope],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    const now = Date.now();
    const since = range ? now - Number(range) * 864e5 : 0;
    let list = contacts.filter((c) => {
      if (project && c.complexId !== project) return false;
      if (status && c.status !== status) return false;
      if (since && new Date(c.date).getTime() < since) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.email.toLowerCase().includes(needle) ||
        (digits.length > 0 && c.phone.replace(/\D/g, "").includes(digits))
      );
    });
    if (sort) {
      const val = (c: Contact): string | number => {
        switch (sort.key) {
          case "date": return new Date(c.date).getTime();
          case "status": return STATUS_ORDER.indexOf(c.status);
          case "model": return c.villas[0] ? `${model(c.complexId, c.villas[0])} ${c.villas[0]}` : "";
          default: return String(c[sort.key] ?? "").toLowerCase();
        }
      };
      const dir = sort.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const x = val(a);
        const y = val(b);
        if (x === "" && y !== "") return 1; // empty cells always last
        if (y === "" && x !== "") return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir;
      });
    }
    return list;
  }, [contacts, q, project, status, range, sort, model]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE, current * PAGE);

  // every page keeps the height of the tallest page seen (a short last page leaves white space, it doesn't shrink)
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageH, setPageH] = useState(0);
  useEffect(() => setPageH(0), [filtered.length]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const first = el?.firstElementChild;
    const last = el?.lastElementChild;
    if (!el || !first || !last || pages < 2) return;
    // rows only (not the box's min-height), screen px → dashboard px because of the page zoom
    const h = (last.getBoundingClientRect().bottom - first.getBoundingClientRect().top) / uiScale();
    setPageH((prev) => Math.max(prev, Math.ceil(h)));
  }, [rows, pages]);

  const keepPage = useRef(false);
  useEffect(() => {
    if (keepPage.current) {
      keepPage.current = false;
      return;
    }
    setPage(1);
  }, [q, project, status, range, sort]);

  // jump to a contact picked in "Search anything"
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!focus) return;
    const i = contacts.findIndex((c) => c.key === focus.id || c.leadIds.includes(focus.id));
    if (i < 0) return;
    keepPage.current = Boolean(q || project || status || range || sort);
    setQ("");
    setProject("");
    setStatus("");
    setRange("");
    setSort(null);
    setPage(Math.floor(i / PAGE) + 1);
    setFlash(contacts[i].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);
  useEffect(() => {
    if (!flash) return;
    const el = document.querySelector(`[data-row="${CSS.escape(flash)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => setFlash(null), 2600);
    return () => window.clearTimeout(t);
  }, [flash, page]);

  // popups close on click elsewhere, Escape, or scrolling (they are anchored to the click point)
  useEffect(() => {
    if (!notePop && !statusPop) return;
    const close = () => {
      setNotePop(null);
      setStatusPop(null);
    };
    const down = (e: PointerEvent) => {
      if (!popRef.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [notePop, statusPop]);

  const anchor = (e: React.MouseEvent, key: string, below = false): Pop => {
    // screen pixels → dashboard pixels (the page is zoomed to fit the window)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return below ? { key, x: toUi(r.left), y: toUi(r.bottom) + 6 } : { key, x: toUi(e.clientX), y: toUi(e.clientY) + 10 };
  };

  const cycleSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const changeStatus = async (c: Contact, next: LeadStatus) => {
    setStatusPop(null);
    if (next === c.status) return;
    const ids = new Set(c.leadIds);
    const before = leads.filter((l) => ids.has(l.id)).map((l) => [l.id, l.status] as const);
    onLeads((prev) => prev.map((l) => (ids.has(l.id) ? { ...l, status: next } : l)));
    const res = await fetch("/api/client/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: c.leadIds, status: next }),
    });
    if (!res.ok) {
      const old = new Map(before);
      onLeads((prev) => prev.map((l) => (old.has(l.id) ? { ...l, status: old.get(l.id) } : l)));
      setErr((await res.json().catch(() => ({}))).error || "تعذر تغيير الحالة");
    }
  };

  const remove = async (c: Contact) => {
    if (!(await confirm(`حذف ${c.name || "هذا العميل"}؟ لا يمكن التراجع عن ذلك.`, "حذف العميل"))) return;
    const res = await fetch("/api/client/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: c.leadIds }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "تعذر الحذف");
      return;
    }
    const ids = new Set(c.leadIds);
    onLeads((prev) => prev.filter((l) => !ids.has(l.id)));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(c.key);
      return n;
    });
  };

  const exportAs = (format: "excel" | "pdf") => {
    setExportOpen(false);
    const list = selected.size ? filtered.filter((c) => selected.has(c.key)) : filtered;
    const head = ["الاسم الكامل", "اللقب", "البريد الإلكتروني", "الهاتف", "ملاحظة العميل", "الفلل", ...(scope ? [] : ["المشروع"]), "التاريخ", "الحالة"];
    const rows = list.map((c) => [
      c.name,
      c.gender,
      c.email,
      c.phone,
      c.note,
      c.villas.map((v) => `${v}${model(c.complexId, v) ? ` (${model(c.complexId, v)})` : ""}`).join("، "),
      ...(scope ? [] : [c.project]),
      fmtDate(c.date),
      STATUS_LABEL[c.status],
    ]);
    const by = (st: LeadStatus) => list.filter((c) => c.status === st).length;
    const table: ExportTable = {
      title: scope ? `${scope.name} · العملاء` : "جميع العملاء",
      subtitle: selected.size ? "العملاء المحددون" : scope ? "كل من استفسر عن فيلا في هذا المشروع" : "كل من استفسر عن فيلا، في جميع المشاريع",
      noun: "عميل",
      head,
      rows,
      cols: [{}, {}, {}, {}, { wide: true }, { wide: true }, ...(scope ? [] : [{}]), {}, { tones: { "جديد": "blue", "قيد المتابعة": "amber", "تم البيع": "green" } }],
      summary: [
        { label: "العملاء", value: String(list.length) },
        { label: "جديد", value: String(by("new")), tone: "blue" },
        { label: "قيد المتابعة", value: String(by("in_progress")), tone: "amber" },
        { label: "تم البيع", value: String(by("sold")), tone: "green" },
      ],
    };
    if (format === "excel") exportExcel(table);
    else exportPdf(table);
  };

  useEffect(() => {
    if (!exportOpen) return;
    const down = (e: PointerEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setExportOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [exportOpen]);

  const clearFilters = () => {
    setQ("");
    setProject("");
    setStatus("");
    setRange("");
    setSort(null);
    setSelected(new Set());
  };

  const pageKeys = rows.map((c) => c.key);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      for (const k of pageKeys) {
        if (allOnPage) n.delete(k);
        else n.add(k);
      }
      return n;
    });
  const toggleOne = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleOpen = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // plain render function (not a component) so the button keeps focus across re-renders
  const head = (k: SortKey, label: string) => {
    const on = sort?.key === k ? sort.dir : null;
    return (
      <button
        key={k}
        type="button"
        className={`axc-th${on ? " on" : ""}`}
        onClick={() => cycleSort(k)}
        aria-sort={on === "asc" ? "ascending" : on === "desc" ? "descending" : "none"}
        title={on === "asc" ? "مرتب تصاعدياً (اضغط للترتيب التنازلي)" : on === "desc" ? "مرتب تنازلياً (اضغط لإلغاء الترتيب)" : "ترتيب"}
      >
        {label}
        {on === "asc" ? <IcSortFlipped size={13} /> : <IcSortNone size={13} />}
      </button>
    );
  };

  const notePopContact = notePop ? contacts.find((c) => c.key === notePop.key) : null;
  const statusPopContact = statusPop ? contacts.find((c) => c.key === statusPop.key) : null;
  const clampX = (x: number, w: number) => Math.max(8, Math.min(x, (typeof window !== "undefined" ? toUi(window.innerWidth) : 1920) - w - 8));

  const pageButtons = (() => {
    if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
    const start = Math.min(Math.max(1, current - 1), pages - 2);
    return [start, start + 1, start + 2];
  })();

  return (
    <section className={`axc${scope ? " axc-scoped" : ""}`}>
      <header className="axc-head">
        <span className="axc-emblem"><IcUsersRound size={45} stroke={1.9} /></span>
        <div>
          <h1>{scope ? `عملاء ${scope.name}` : "جميع العملاء"}</h1>
          <p>{scope ? "العملاء المهتمون بهذا المشروع" : "العملاء المهتمون في جميع المشاريع"}</p>
        </div>
        {tabs}
      </header>

      <div className="axc-filters">
        <div className="axc-filters-title">
          <span className="axc-filter-emblem"><IcFilter size={18} /></span>
          التصفية
        </div>
        <div className="axc-controls">
          <label className="axc-search">
            <IcSearch size={19} />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو البريد أو الهاتف..."
              aria-label="البحث في العملاء"
            />
          </label>
          {scope ? null : (
            <DashSelect
              className="axc-select wide"
              ariaLabel="المشروع"
              value={project}
              onChange={setProject}
              options={[{ value: "", label: "جميع المشاريع" }, ...complexes.map((c) => ({ value: c.id, label: c.name }))]}
            />
          )}
          <DashSelect<"" | LeadStatus>
            ariaLabel="الحالة"
            value={status}
            onChange={setStatus}
            options={[{ value: "", label: scope ? "كل الحالات" : "الحالة" }, ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
          />
          <DashSelect<typeof range>
            ariaLabel="التاريخ"
            value={range}
            onChange={setRange}
            options={[
              { value: "", label: "كل الفترة" },
              { value: "7", label: "آخر 7 أيام" },
              { value: "30", label: "آخر 30 يوماً" },
              { value: "90", label: "آخر 90 يوماً" },
            ]}
          />
          <span className="axc-spacer" />
          <div className="axc-export" ref={exportRef}>
            <button
              type="button"
              className="axc-btn"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((v) => !v)}
              title={selected.size ? `تصدير ${selected.size} محدد` : "تصدير القائمة"}
            >
              <IcExport size={18} />
              تصدير{selected.size ? ` (${selected.size})` : ""}
            </button>
            {exportOpen ? (
              <div className="axc-pop axc-export-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => exportAs("excel")}>
                  <b className="xls">XLS</b> إكسل
                </button>
                <button type="button" role="menuitem" onClick={() => exportAs("pdf")}>
                  <b className="pdf">PDF</b> PDF
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="axc-btn" onClick={clearFilters}>
            <IcRotate size={18} />
            مسح التصفية
          </button>
        </div>
      </div>

      {err ? <p className="axd-err" role="alert">{err}</p> : null}

      <div className={`axc-table${pages > 1 ? " paged" : ""}`}>
        <div className="axc-scroll" ref={scrollRef} style={pages > 1 && pageH ? { minHeight: pageH } : undefined}>
          <div className="axc-grid axc-headrow" role="row">
            <span className="axc-check-cell">
              <input type="checkbox" className="axc-check" checked={allOnPage} onChange={toggleAll} aria-label="تحديد الكل في هذه الصفحة" />
            </span>
            <span className="axc-name-head">{head("name", "الاسم الكامل")}</span>
            {head("gender", "اللقب")}
            {head("email", "البريد الإلكتروني")}
            {head("phone", "الهاتف")}
            {head("note", "ملاحظة العميل")}
            {head("model", "النموذج")}
            {scope ? null : head("project", "المشروع")}
            {head("date", "التاريخ")}
            {head("status", "الحالة")}
            <span className="axc-th plain">إجراءات</span>
          </div>

          {rows.map((c) => {
            const expanded = open.has(c.key);
            const more = c.villas.slice(1);
            return (
              <Fragment key={c.key}>
                <div className={`axc-grid axc-row${selected.has(c.key) ? " sel" : ""}${flash === c.key ? " flash" : ""}`} role="row" data-row={c.key}>
                  <span className="axc-check-cell">
                    <input type="checkbox" className="axc-check" checked={selected.has(c.key)} onChange={() => toggleOne(c.key)} aria-label={`تحديد ${c.name}`} />
                  </span>
                  <span className="axc-identity">
                    <span className="axc-avatar">{c.initials}</span>
                    <span className="axc-name" title={c.name}>{c.name}</span>
                    {more.length ? (
                      <button
                        type="button"
                        className={`axc-expand${expanded ? " open" : ""}`}
                        onClick={() => toggleOpen(c.key)}
                        aria-expanded={expanded}
                        title={expanded ? "إخفاء الفلل الأخرى" : `${more.length} فلل أخرى أعجبته`}
                      >
                        <IcChevronDown size={14} />
                        <i>{more.length}</i>
                      </button>
                    ) : null}
                  </span>
                  <span className="axc-cell">{c.gender}</span>
                  <span className="axc-cell">
                    {c.email ? <a className="axc-email" dir="ltr" href={`mailto:${c.email}`} title={c.email}>{c.email}</a> : "—"}
                  </span>
                  <span className="axc-cell"><bdi dir="ltr">{c.phone || "—"}</bdi></span>
                  <span className="axc-cell">
                    {c.note ? (
                      c.note.length > NOTE_PREVIEW ? (
                        <button
                          type="button"
                          className="axc-note"
                          onClick={(e) => {
                            setStatusPop(null);
                            setNotePop(notePop?.key === c.key ? null : anchor(e, c.key));
                          }}
                          title="قراءة الملاحظة كاملة"
                        >
                          <bdi dir="auto">{c.note.slice(0, NOTE_PREVIEW).trimEnd()}…</bdi>
                        </button>
                      ) : (
                        <span dir="auto">{c.note}</span>
                      )
                    ) : "—"}
                  </span>
                  <span className="axc-cell">{c.villas[0] ? <VillaCell model={model(c.complexId, c.villas[0])} villa={c.villas[0]} /> : "—"}</span>
                  {scope ? null : <span className="axc-cell">{c.project}</span>}
                  <span className="axc-cell">{fmtDate(c.date)}</span>
                  <span className="axc-cell">
                    <button
                      type="button"
                      className={`axc-status ${c.status}`}
                      aria-haspopup="listbox"
                      aria-expanded={statusPop?.key === c.key}
                      onClick={(e) => {
                        setNotePop(null);
                        setStatusPop(statusPop?.key === c.key ? null : anchor(e, c.key, true));
                      }}
                    >
                      {STATUS_LABEL[c.status]}
                      <IcChevronDown size={13} stroke={2.4} />
                    </button>
                  </span>
                  <span className="axc-cell axc-actions">
                    <button type="button" className="axc-trash" onClick={() => void remove(c)} title="حذف العميل" aria-label={`حذف ${c.name}`}>
                      <IcTrash size={17} />
                    </button>
                  </span>
                </div>
                {expanded
                  ? more.map((v) => (
                    <div key={`${c.key}|${v}`} className="axc-grid axc-row axc-subrow" role="row">
                      <span /><span /><span /><span /><span /><span />
                      <span className="axc-cell"><VillaCell model={model(c.complexId, v)} villa={v} /></span>
                      {scope ? null : <span />}
                      <span /><span /><span />
                    </div>
                  ))
                  : null}
              </Fragment>
            );
          })}
          {!rows.length ? <p className="axc-empty">لا يوجد عملاء يطابقون هذه التصفية.</p> : null}
        </div>

        <footer className="axc-foot">
          <span>{filtered.length} نتيجة</span>
          {pages > 1 ? (
            <nav className="axc-pages" aria-label="الصفحات">
              <button type="button" className="axc-page arrow" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="الصفحة السابقة">
                <IcArrowRight size={19} />
              </button>
              {pageButtons.map((n) => (
                <button key={n} type="button" className={`axc-page${n === current ? " on" : ""}`} onClick={() => setPage(n)} aria-current={n === current ? "page" : undefined}>
                  {n}
                </button>
              ))}
              <button type="button" className="axc-page arrow" disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="الصفحة التالية">
                <IcArrowLeft size={19} />
              </button>
            </nav>
          ) : null}
        </footer>
      </div>

      {notePop && notePopContact ? (
        <div
          ref={popRef}
          className="axc-pop axc-note-pop"
          role="dialog"
          aria-label={`ملاحظة من ${notePopContact.name}`}
          style={{ left: clampX(notePop.x, 320), top: notePop.y }}
        >
          <button type="button" className="axc-pop-x" onClick={() => setNotePop(null)} aria-label="إغلاق">
            <IcX size={16} />
          </button>
          <strong>{notePopContact.name}</strong>
          <p dir="auto">{notePopContact.note}</p>
        </div>
      ) : null}

      {statusPop && statusPopContact ? (
        <div ref={popRef} className="axc-pop axc-status-pop" role="listbox" style={{ left: clampX(statusPop.x, 150), top: statusPop.y }}>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === statusPopContact.status}
              className={s === statusPopContact.status ? "on" : ""}
              onClick={() => void changeStatus(statusPopContact, s)}
            >
              <span className={`axc-status ${s}`}>{STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>
      ) : null}
      {dialog}
    </section>
  );
}

function VillaCell({ model, villa }: { model: string; villa: string }) {
  return (
    <span className="axc-villa" title={`فيلا ${villa}${model ? ` · نموذج ${model}` : ""}`}>
      {model ? <>{model} <small>· {villa}</small></> : villa}
    </span>
  );
}
