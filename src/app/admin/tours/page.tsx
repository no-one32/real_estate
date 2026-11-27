"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AdminShell from "../AdminShell";
import { useConfirm } from "@/components/ConfirmDialog";
import { uploadAssets } from "@/lib/admin-upload";
import { assetRelSegments } from "@/lib/asset-path";
import { usePortals } from "../usePortals";
import { Ai360, AiEye, AiTrash, AiUpload } from "../AdminIcons";

export default function ToursPage() {
  const { portals, ready, err, setErr, reload } = usePortals();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const { confirm, dialog } = useConfirm();

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return portals.filter((p) => !n || p.name.toLowerCase().includes(n));
  }, [portals, q]);
  const open = portals.find((p) => p.id === (openId ?? shown[0]?.id)) ?? null;
  const scenes = useMemo(
    () =>
      (open?.scenes ?? [])
        .map((s) => ({ ...s, label: assetRelSegments(s.path, "scene_360").join(" / ") || "scene" }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    [open],
  );

  const add = async (files: File[]) => {
    if (!open) return;
    setErr("");
    setMsg("");
    const res = await uploadAssets(open.id, files, "scene_360", { onProgress: (d, t) => setBusy(`Uploading ${d} / ${t}`) });
    setBusy("");
    if (res.error) setErr(res.error);
    if (res.ok) setMsg(`${res.ok} panorama(s) added to ${open.name}`);
    void reload();
  };

  const remove = async (id: string, label: string) => {
    if (!(await confirm(`Delete the panorama “${label}”?`, "Delete scene"))) return;
    const res = await fetch("/api/admin/assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not delete");
    else void reload();
  };

  return (
    <AdminShell search={q} onSearch={setQ} searchPlaceholder="Search projects…">
      <header className="axa-head">
        <div>
          <h1>360° Tour Builder</h1>
          <p>Upload panoramas for each project, keep the scenes in order, then preview the live tour.</p>
        </div>
      </header>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}
      {!ready && <p className="muted">Loading…</p>}

      {ready && (
        <div className="axa-split">
          <nav className="axa-list" aria-label="Projects">
            {shown.map((p) => (
              <button key={p.id} type="button" className={`axa-list-item${open?.id === p.id ? " on" : ""}`} onClick={() => setOpenId(p.id)}>
                <span className="axa-list-ico"><Ai360 size={20} /></span>
                <span className="axa-list-text">
                  <b>{p.name}</b>
                  <small>{p.scenes.length} site scenes · {p.villa360} inside-villa photos</small>
                </span>
              </button>
            ))}
            {!shown.length && <p className="muted">No projects.</p>}
          </nav>

          {open && (
            <section className="axa-panel">
              <header className="axa-panel-head">
                <div>
                  <h2>{open.name}</h2>
                  <p>Equirectangular panoramas (2:1). Name them 1.jpg, 2.jpg… — the number is the order in the tour. Large files are resized to ~4096px.</p>
                </div>
                <div className="axa-panel-actions">
                  <a className="btn ghost" href={`/digital-twins/${open.slug}`} target="_blank" rel="noreferrer"><AiEye size={16} />Preview tour</a>
                  <label className={`btn${busy ? " disabled" : ""}`}>
                    <input
                      type="file"
                      multiple
                      hidden
                      accept="image/jpeg,image/png,image/webp"
                      disabled={!!busy}
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        void add(list);
                      }}
                    />
                    <AiUpload size={16} />
                    {busy || "Add panoramas"}
                  </label>
                </div>
              </header>

              <div className="axa-steps">
                <span className={open.scenes.length ? "done" : ""}><i>1</i>Upload panoramas</span>
                <span className={open.scenes.length > 1 ? "done" : ""}><i>2</i>Order scenes (file names)</span>
                <span className={open.villa360 ? "done" : ""}><i>3</i>Inside-villa 360</span>
                <span className={open.published ? "done" : ""}><i>4</i>Publish</span>
              </div>

              {scenes.length ? (
                <div className="axa-scenes">
                  {scenes.map((s, i) => (
                    <figure key={s.id} className="axa-scene">
                      <img src={s.path} alt="" loading="lazy" />
                      <figcaption>
                        <span className="axa-scene-n">{i + 1}</span>
                        <span title={s.label}>{s.label}</span>
                        <button type="button" className="icon-btn danger" aria-label="Delete scene" onClick={() => void remove(s.id, s.label)}><AiTrash size={15} /></button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="axa-empty">No site panoramas yet for this project.</p>
              )}

              <footer className="axa-panel-foot">
                <span>Inside-villa 360 photos (per villa type, floor by floor): <b>{open.villa360}</b></span>
                <Link className="btn ghost" href={`/admin/complexes/${open.id}?tab=media`}>Manage inside-villa 360</Link>
                <span className={`axa-pill inline ${open.published ? "green" : "orange"}`}><i />{open.published ? "Live" : "Hidden"}</span>
              </footer>
            </section>
          )}
        </div>
      )}
      {dialog}
    </AdminShell>
  );
}
