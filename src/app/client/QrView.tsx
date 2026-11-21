"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import type { ComplexRow } from "@/lib/types";
import { IcQr, IcRotate, IcTrash } from "./DashIcons";
import ProjectStrip from "./ProjectStrip";
import DashSelect from "./DashSelect";
import { useConfirm } from "@/components/ConfirmDialog";

const SIZES = [
  { px: 512, label: "صغير · 512 px (للشاشات)" },
  { px: 1024, label: "متوسط · 1024 px (للمطويات)" },
  { px: 2048, label: "كبير · 2048 px (للملصقات)" },
];

type Spec = {
  url: string;
  size: number;
  label: string;
  /** small image in the middle (data URL), optional */
  logo?: string;
  /** saved code id: added to tour links as ?qr=… so Analytics counts the scans of each code */
  id?: string;
};

/** What the code really contains: tour links carry the code id. */
function encodedUrl(spec: Spec) {
  if (!spec.id) return spec.url;
  try {
    const u = new URL(spec.url);
    if (!/^\/c\//.test(u.pathname)) return spec.url;
    u.searchParams.set("src", "qr");
    u.searchParams.set("qr", spec.id);
    return u.toString();
  } catch {
    return spec.url;
  }
}

/** A code generated for this project (table `qr_codes`, shared by everyone on the project). */
type Saved = Spec & { id: string; at: string };

type Row = { id: string; label: string; url: string; size: number; logo: string | null; created_at: string };
const fromRow = (r: Row): Saved => ({ id: r.id, label: r.label, url: r.url, size: r.size, logo: r.logo || undefined, at: r.created_at });

const slugify = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "qr";

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("ar-u-nu-latn", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

function validUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** The picked image, fitted in a 256 px square PNG (keeps the saved list small). */
async function shrinkLogo(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth || 256;
    const h = img.naturalHeight || 256;
    const k = 256 / Math.max(w, h);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * Math.min(1, k)));
    c.height = Math.max(1, Math.round(h * Math.min(1, k)));
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The code itself; with a center image it uses the strongest error correction so it still scans. */
async function drawQr(spec: Spec, size: number, margin = 2) {
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, encodedUrl(spec), {
    width: size,
    margin,
    errorCorrectionLevel: spec.logo ? "H" : "M",
    color: { dark: "#0b1220", light: "#ffffff" },
  });
  if (!spec.logo) return qr;
  const ctx = qr.getContext("2d");
  if (!ctx) return qr;
  const img = await loadImage(spec.logo);
  // white rounded plate ≈ 24% of the code, image fitted inside it
  const plate = Math.round(qr.width * 0.24);
  const x = Math.round((qr.width - plate) / 2);
  const y = Math.round((qr.height - plate) / 2);
  const r = Math.round(plate * 0.18);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + plate, y, x + plate, y + plate, r);
  ctx.arcTo(x + plate, y + plate, x, y + plate, r);
  ctx.arcTo(x, y + plate, x, y, r);
  ctx.arcTo(x, y, x + plate, y, r);
  ctx.closePath();
  ctx.fill();
  const pad = Math.round(plate * 0.1);
  const box = plate - pad * 2;
  const k = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x + (plate - w) / 2, y + (plate - h) / 2, w, h);
  return qr;
}

/** PNG at the chosen size, with the center image and the label printed under the code when there is one. */
async function renderPng(spec: Spec) {
  const qr = await drawQr(spec, spec.size);
  if (!spec.label.trim()) return qr.toDataURL("image/png");
  const band = Math.round(spec.size * 0.14);
  const out = document.createElement("canvas");
  out.width = spec.size;
  out.height = spec.size + band;
  const ctx = out.getContext("2d");
  if (!ctx) return qr.toDataURL("image/png");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(qr, 0, 0);
  ctx.fillStyle = "#0b1220";
  ctx.font = `700 ${Math.round(spec.size * 0.055)}px Inter, "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spec.label.trim(), spec.size / 2, spec.size + band * 0.38, spec.size * 0.9);
  return out.toDataURL("image/png");
}

const sameSpec = (a: Spec, b: Spec) => a.url === b.url && a.size === b.size && a.label === b.label && (a.logo || "") === (b.logo || "");

export default function QrView({
  cx,
  complexes,
  onPick,
  tabs,
}: {
  cx: ComplexRow;
  complexes: ComplexRow[];
  onPick: (id: string) => void;
  tabs: ReactNode;
}) {
  // ?src=qr lets Analytics count visits that came from a scanned code
  const tourUrl = useMemo(() => (typeof window === "undefined" ? `/c/${cx.slug}?src=qr` : `${window.location.origin}/c/${cx.slug}?src=qr`), [cx.slug]);
  const initial: Spec = { url: tourUrl, size: 1024, label: cx.name };
  const [draft, setDraft] = useState<Spec>(initial);
  const [spec, setSpec] = useState<Spec>(initial);
  const [preview, setPreview] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Saved[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy] = useState("");
  const logoRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm({ cancel: "إلغاء", ok: "تأكيد", title: "هل أنت متأكد؟" });

  // this project's saved codes
  useEffect(() => {
    let alive = true;
    setHistory([]);
    setLoadingList(true);
    fetch(`/api/client/qr?complexId=${encodeURIComponent(cx.id)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (ok) setHistory(((j.codes ?? []) as Row[]).map(fromRow));
        else setErr(j.error || "تعذر تحميل الرموز المحفوظة");
      })
      .catch(() => alive && setErr("تعذر تحميل الرموز المحفوظة"))
      .finally(() => alive && setLoadingList(false));
    return () => {
      alive = false;
    };
  }, [cx.id]);

  // small previews for the table, drawn in the browser
  useEffect(() => {
    let alive = true;
    const missing = history.filter((h) => !thumbs[h.id]);
    if (!missing.length) return;
    void (async () => {
      const add: Record<string, string> = {};
      for (const h of missing) {
        try {
          add[h.id] = (await drawQr(h, 120, 1)).toDataURL("image/png");
        } catch {
          add[h.id] = "";
        }
      }
      if (alive) setThumbs((t) => ({ ...t, ...add }));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  /** the saved code for this spec (saved now if it is new) */
  const remember = async (s: Spec): Promise<Saved | null> => {
    const known = history.find((h) => sameSpec(h, s));
    if (known) return known;
    const res = await fetch("/api/client/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: cx.id, label: s.label, url: s.url, size: s.size, logo: s.logo ?? null }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error || "تعذر حفظ هذا الرمز");
      return null;
    }
    const saved = fromRow(j.code as Row);
    setHistory((prev) => [saved, ...prev]);
    return saved;
  };

  const forget = async (h: Saved) => {
    if (!(await confirm(`إزالة «${h.label || "بدون اسم"}» من الرموز المنشأة؟ النسخ المطبوعة ستبقى تعمل.`, "إزالة الرمز"))) return;
    const res = await fetch("/api/client/qr", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: h.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "تعذرت إزالة هذا الرمز");
      return;
    }
    setHistory((prev) => prev.filter((x) => x.id !== h.id));
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      setErr("");
      const logo = await shrinkLogo(file);
      setDraft((d) => ({ ...d, logo }));
    } catch {
      setErr("تعذرت قراءة هذه الصورة. جرّب PNG أو JPG.");
    } finally {
      if (logoRef.current) logoRef.current.value = "";
    }
  };

  // switching project resets the generator to that project's tour
  useEffect(() => {
    const next = { url: tourUrl, size: 1024, label: cx.name };
    setDraft(next);
    setSpec(next);
  }, [cx.id, cx.name, tourUrl]);

  // preview of the generated code (screen size; the PNG uses the chosen size)
  useEffect(() => {
    let alive = true;
    drawQr(spec, 440, 1)
      .then((c) => alive && setPreview(c.toDataURL("image/png")))
      .catch(() => alive && setPreview(""));
    return () => {
      alive = false;
    };
  }, [spec]);

  const changed = !sameSpec(draft, spec);

  const [saving, setSaving] = useState(false);
  const generate = async () => {
    const url = draft.url.trim();
    if (!validUrl(url)) {
      setErr("أدخل رابطاً كاملاً يبدأ بـ https://");
      return;
    }
    setErr("");
    const next = { ...draft, url };
    setSaving(true);
    const saved = await remember(next);
    setSaving(false);
    // the code shown is the saved one (its id makes each code countable in Analytics)
    setSpec(saved ?? next);
    setDraft(saved ? { url: saved.url, size: saved.size, label: saved.label, logo: saved.logo } : next);
  };

  const save = async (s: Spec) => {
    const data = await renderPng(s);
    const a = document.createElement("a");
    a.href = data;
    a.download = `${slugify(s.label || cx.name)}-qr-${s.size}.png`;
    a.click();
  };

  const download = async () => {
    setBusy(true);
    try {
      const saved = spec.id ? null : await remember(spec);
      if (saved) setSpec(saved);
      await save(saved ?? spec);
    } catch {
      setErr("تعذر إنشاء الصورة");
    } finally {
      setBusy(false);
    }
  };

  const downloadRow = async (h: Saved) => {
    setRowBusy(h.id);
    try {
      await save(h);
    } catch {
      setErr("تعذر إنشاء الصورة");
    } finally {
      setRowBusy("");
    }
  };

  const pointsToTour = spec.url === tourUrl;

  return (
    <section className="axq">
      <header className="axq-head">
        {tabs ? <span className="axp-emblem"><IcQr size={40} stroke={1.8} /></span> : null}
        <div>
          <h1>رموز QR</h1>
          <p>أنشئ وشارك رموزاً قابلة للمسح تفتح مجسمك الافتراضي</p>
        </div>
        {tabs}
      </header>

      <ProjectStrip cx={cx} complexes={complexes} onPick={onPick} />

      <div className="axq-grid">
        <div className="axq-section">
          <div className="axq-section-head">
            <div>
              <h2>إنشاء رمز QR</h2>
              <p>وجّه الرمز إلى أي رابط، ثم حمّله للطباعة أو للشاشة</p>
            </div>
            <span className="axq-pill blue">معاينة مباشرة</span>
          </div>

          <div className="axq-form">
            <label className="axq-field full">
              <span>رابط الوجهة</span>
              <input
                type="url"
                dir="ltr"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void generate()}
                spellCheck={false}
              />
            </label>
            <label className="axq-field">
              <span>الحجم</span>
              <DashSelect
                className="axq-select"
                chevron={14}
                ariaLabel="الحجم"
                value={draft.size}
                onChange={(size) => setDraft({ ...draft, size })}
                options={SIZES.map((s) => ({ value: s.px, label: s.label }))}
              />
            </label>
            <label className="axq-field">
              <span>الاسم</span>
              <input value={draft.label} maxLength={40} onChange={(e) => setDraft({ ...draft, label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void generate()} />
            </label>
            <div className="axq-field full">
              <span>صورة في الوسط (اختياري)</span>
              <div className="axq-logo">
                {draft.logo ? (
                  <>
                    <span className="axq-logo-thumb"><img src={draft.logo} alt="" /></span>
                    <span className="axq-logo-text">تظهر في وسط الرمز</span>
                    <button type="button" className="axq-logo-btn" onClick={() => logoRef.current?.click()}>تغيير</button>
                    <button type="button" className="axq-logo-btn danger" onClick={() => setDraft({ ...draft, logo: undefined })}>إزالة</button>
                  </>
                ) : (
                  <button type="button" className="axq-logo-add" onClick={() => logoRef.current?.click()}>
                    <span aria-hidden>+</span>
                    أضف صورة صغيرة أو شعاراً (PNG، JPG، SVG)
                  </button>
                )}
                <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => void pickLogo(e.target.files?.[0])} />
              </div>
            </div>
            {err ? <p className="axd-err full" role="alert">{err}</p> : null}
            {!cx.published && pointsToTour ? (
              <p className="axq-note full">هذا المشروع غير منشور بعد: سيفتح الرمز الجولة بمجرد نشرها.</p>
            ) : null}
            <button type="button" className="axq-dark full" onClick={() => void generate()} disabled={saving}>
              <IcRotate size={15} stroke={1.6} />
              إنشاء رمز QR
            </button>
            {draft.url !== tourUrl ? (
              <button type="button" className="axq-reset full" onClick={() => setDraft({ ...draft, url: tourUrl })}>
                استخدم رابط جولة هذا المشروع
              </button>
            ) : null}
          </div>
        </div>

        <div className="axq-section">
          <div className="axq-section-head">
            <div>
              <h2>المعاينة</h2>
              <p>امسحه بكاميرا أي جوال</p>
            </div>
            <span className={`axq-pill ${changed ? "amber" : "green"}`}>{changed ? "لم يُنشأ بعد" : "جاهز"}</span>
          </div>
          <div className="axq-preview">
            <div className="axq-code">
              {preview ? <img src={preview} alt={`رمز QR إلى ${spec.url}`} width={220} height={220} /> : <span className="axq-code-empty" />}
            </div>
            {spec.label ? <strong>{spec.label}</strong> : null}
            <a className="axq-url" dir="ltr" href={encodedUrl(spec)} target="_blank" rel="noreferrer">{encodedUrl(spec)}</a>
            <button type="button" className="axq-dark" onClick={() => void download()} disabled={busy || !preview}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
              {busy ? "جارٍ التحضير…" : "تحميل PNG"}
            </button>
          </div>
        </div>
      </div>

      <div className="axq-section axq-history">
        <div className="axq-section-head">
          <div>
            <h2>الرموز المنشأة</h2>
            <p>كل رمز تنشئه لهذا المشروع، جاهز للتحميل مجدداً</p>
          </div>
          <span className="axq-pill blue">{history.length} {history.length === 1 ? "رمز" : "رموز"}</span>
        </div>
        {history.length ? (
          <div className="axq-table-wrap">
            <table className="axq-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>التاريخ</th>
                  <th className="center">الرمز</th>
                  <th className="center">تحميل</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <span className="axq-t-name">{h.label.trim() || "بدون اسم"}</span>
                      <span className="axq-t-url" dir="ltr" title={encodedUrl(h)}>{encodedUrl(h)}</span>
                    </td>
                    <td className="axq-t-date">{fmtWhen(h.at)}</td>
                    <td className="center">
                      <span className="axq-t-qr">{thumbs[h.id] ? <img src={thumbs[h.id]} alt={`رمز QR ${h.label}`} /> : null}</span>
                    </td>
                    <td className="center">
                      <span className="axq-t-actions">
                        <button type="button" className="axq-dark small" onClick={() => void downloadRow(h)} disabled={rowBusy === h.id}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                          </svg>
                          {rowBusy === h.id ? "…" : "PNG"}
                        </button>
                        <button type="button" className="axq-t-del" onClick={() => void forget(h)} aria-label={`إزالة ${h.label || "الرمز"} من القائمة`} title="إزالة من القائمة">
                          <IcTrash size={15} stroke={1.8} />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="axq-t-empty">{loadingList ? "جارٍ التحميل…" : "لا توجد رموز بعد. اضغط «إنشاء رمز QR» وسيظهر هنا."}</p>
        )}
      </div>

      {dialog}
      <p className="axq-foot">AXIS Studio · تُنشأ الرموز في هذه الصفحة ولا تنتهي صلاحيتها</p>
    </section>
  );
}
