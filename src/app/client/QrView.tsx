"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import type { ComplexRow } from "@/lib/types";
import { IcQr, IcRotate, IcTrash } from "./DashIcons";
import ProjectStrip from "./ProjectStrip";
import DashSelect from "./DashSelect";
import { useConfirm } from "@/components/ConfirmDialog";

const SIZES = [
  { px: 512, label: "Small · 512 px (screens)" },
  { px: 1024, label: "Medium · 1024 px (flyers)" },
  { px: 2048, label: "Large · 2048 px (posters)" },
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

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "qr";

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

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
  ctx.font = `700 ${Math.round(spec.size * 0.055)}px Inter, "Segoe UI", Arial, sans-serif`;
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
  const { confirm, dialog } = useConfirm();

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
        else setErr(j.error || "Could not load the saved codes");
      })
      .catch(() => alive && setErr("Could not load the saved codes"))
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
      setErr(j.error || "Could not save this code");
      return null;
    }
    const saved = fromRow(j.code as Row);
    setHistory((prev) => [saved, ...prev]);
    return saved;
  };

  const forget = async (h: Saved) => {
    if (!(await confirm(`Remove “${h.label || "Untitled"}” from the generated codes? Printed copies keep working.`, "Remove code"))) return;
    const res = await fetch("/api/client/qr", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: h.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Could not remove this code");
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
      setErr("This image could not be read. Try a PNG or JPG.");
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
      setErr("Enter a full link starting with https://");
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
      setErr("Could not create the image");
    } finally {
      setBusy(false);
    }
  };

  const downloadRow = async (h: Saved) => {
    setRowBusy(h.id);
    try {
      await save(h);
    } catch {
      setErr("Could not create the image");
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
          <h1>QR Codes</h1>
          <p>Create and share scannable codes that open your virtual maquette</p>
        </div>
        {tabs}
      </header>

      <ProjectStrip cx={cx} complexes={complexes} onPick={onPick} />

      <div className="axq-grid">
        <div className="axq-section">
          <div className="axq-section-head">
            <div>
              <h2>QR Code Generator</h2>
              <p>Point the code to any link, then download it for print or screen</p>
            </div>
            <span className="axq-pill blue">Live preview</span>
          </div>

          <div className="axq-form">
            <label className="axq-field full">
              <span>Destination URL</span>
              <input
                type="url"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void generate()}
                spellCheck={false}
              />
            </label>
            <label className="axq-field">
              <span>Size</span>
              <DashSelect
                className="axq-select"
                chevron={14}
                ariaLabel="Size"
                value={draft.size}
                onChange={(size) => setDraft({ ...draft, size })}
                options={SIZES.map((s) => ({ value: s.px, label: s.label }))}
              />
            </label>
            <label className="axq-field">
              <span>Label</span>
              <input value={draft.label} maxLength={40} onChange={(e) => setDraft({ ...draft, label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void generate()} />
            </label>
            <div className="axq-field full">
              <span>Center image (optional)</span>
              <div className="axq-logo">
                {draft.logo ? (
                  <>
                    <span className="axq-logo-thumb"><img src={draft.logo} alt="" /></span>
                    <span className="axq-logo-text">Shown in the middle of the code</span>
                    <button type="button" className="axq-logo-btn" onClick={() => logoRef.current?.click()}>Change</button>
                    <button type="button" className="axq-logo-btn danger" onClick={() => setDraft({ ...draft, logo: undefined })}>Remove</button>
                  </>
                ) : (
                  <button type="button" className="axq-logo-add" onClick={() => logoRef.current?.click()}>
                    <span aria-hidden>+</span>
                    Add a small image or logo (PNG, JPG, SVG)
                  </button>
                )}
                <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => void pickLogo(e.target.files?.[0])} />
              </div>
            </div>
            {err ? <p className="axd-err full" role="alert">{err}</p> : null}
            {!cx.published && pointsToTour ? (
              <p className="axq-note full">This project is not live yet: the code will open the tour once it is published.</p>
            ) : null}
            <button type="button" className="axq-dark full" onClick={() => void generate()} disabled={saving}>
              <IcRotate size={15} stroke={1.6} />
              Generate QR code
            </button>
            {draft.url !== tourUrl ? (
              <button type="button" className="axq-reset full" onClick={() => setDraft({ ...draft, url: tourUrl })}>
                Use this project&apos;s tour link
              </button>
            ) : null}
          </div>
        </div>

        <div className="axq-section">
          <div className="axq-section-head">
            <div>
              <h2>Preview</h2>
              <p>Scan with any phone camera</p>
            </div>
            <span className={`axq-pill ${changed ? "amber" : "green"}`}>{changed ? "Not generated" : "Ready"}</span>
          </div>
          <div className="axq-preview">
            <div className="axq-code">
              {preview ? <img src={preview} alt={`QR code to ${spec.url}`} width={220} height={220} /> : <span className="axq-code-empty" />}
            </div>
            {spec.label ? <strong>{spec.label}</strong> : null}
            <a className="axq-url" href={encodedUrl(spec)} target="_blank" rel="noreferrer">{encodedUrl(spec)}</a>
            <button type="button" className="axq-dark" onClick={() => void download()} disabled={busy || !preview}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
              {busy ? "Preparing…" : "Download PNG"}
            </button>
          </div>
        </div>
      </div>

      <div className="axq-section axq-history">
        <div className="axq-section-head">
          <div>
            <h2>Generated codes</h2>
            <p>Every code you generate for this project, ready to download again</p>
          </div>
          <span className="axq-pill blue">{history.length} code{history.length === 1 ? "" : "s"}</span>
        </div>
        {history.length ? (
          <div className="axq-table-wrap">
            <table className="axq-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th className="center">QR</th>
                  <th className="center">Download</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <span className="axq-t-name">{h.label.trim() || "Untitled"}</span>
                      <span className="axq-t-url" title={encodedUrl(h)}>{encodedUrl(h)}</span>
                    </td>
                    <td className="axq-t-date">{fmtWhen(h.at)}</td>
                    <td className="center">
                      <span className="axq-t-qr">{thumbs[h.id] ? <img src={thumbs[h.id]} alt={`QR code ${h.label}`} /> : null}</span>
                    </td>
                    <td className="center">
                      <span className="axq-t-actions">
                        <button type="button" className="axq-dark small" onClick={() => void downloadRow(h)} disabled={rowBusy === h.id}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                          </svg>
                          {rowBusy === h.id ? "…" : "PNG"}
                        </button>
                        <button type="button" className="axq-t-del" onClick={() => void forget(h)} aria-label={`Remove ${h.label || "code"} from the list`} title="Remove from the list">
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
          <p className="axq-t-empty">{loadingList ? "Loading…" : "No codes yet. Click “Generate QR code” and it will appear here."}</p>
        )}
      </div>

      {dialog}
      <p className="axq-foot">AXIS Studio · Codes are generated on this page and never expire</p>
    </section>
  );
}
