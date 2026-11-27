"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminShell from "../AdminShell";
import { useConfirm } from "@/components/ConfirmDialog";
import { uploadAssets } from "@/lib/admin-upload";
import { buildScenes360 } from "@/lib/tour";
import { EMPTY_HOTSPOTS, type TourHotspots } from "@/lib/hotspots";
import SceneLinkEditor from "./SceneLinkEditor";
import { usePortals } from "../usePortals";
import { Ai360, AiEye, AiLink, AiTrash, AiUpload } from "../AdminIcons";

/** Scene id a panorama file belongs to — same grouping as buildScenes360 (one scene per folder or per file). */
function sceneIdOf(path: string) {
  const clean = decodeURIComponent(path.split("?")[0]).replace(/\\/g, "/");
  const i = clean.toLowerCase().lastIndexOf("/scene_360/");
  const parts = (i >= 0 ? clean.slice(i + "/scene_360/".length) : clean.split("/").pop() || "").split("/").filter(Boolean);
  if (!parts.length) return "";
  const key = parts.length >= 2 ? parts[0] : parts[0].replace(/\.[^.]+$/, "").replace(/[-_]?(thumb|thumbnail|_sm|_small)$/i, "") || parts[0];
  return key.toLowerCase().replace(/\s+/g, "-");
}
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
  // one scene per panorama (thumbnails grouped with it) — same ids as the public tour
  const scenes = useMemo(() => buildScenes360((open?.scenes ?? []).map((s) => s.path)), [open]);
  const assetIdsOf = (sceneId: string) => (open?.scenes ?? []).filter((a) => sceneIdOf(a.path) === sceneId).map((a) => a.id);

  const [hotspots, setHotspots] = useState<TourHotspots>(EMPTY_HOTSPOTS);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setHotspots(EMPTY_HOTSPOTS);
    void fetch(`/api/admin/hotspots?complexId=${open.id}`)
      .then((r) => r.json())
      .then((j) => alive && j.hotspots && setHotspots(j.hotspots));
    return () => {
      alive = false;
    };
  }, [open?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveLinks = async (scenesLinks: TourHotspots["scenes"], startScene: string | undefined) => {
    if (!open) return false;
    setSaving(true);
    setErr("");
    const res = await fetch("/api/admin/hotspots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: open.id, scenes: scenesLinks, startScene: startScene ?? null }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(json.error || "Could not save");
      return false;
    }
    setHotspots(json.hotspots);
    setMsg("Buttons saved — they now appear in the tour.");
    return true;
  };
  const linkCount = Object.values(hotspots.scenes).reduce((n, l) => n + l.length, 0);

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

  const remove = async (sceneId: string, label: string) => {
    if (!(await confirm(`Delete the panorama “${label}”? Its buttons are removed too.`, "Delete scene"))) return;
    for (const id of assetIdsOf(sceneId)) {
      const res = await fetch("/api/admin/assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErr(json.error || "Could not delete");
        break;
      }
    }
    // drop its buttons and every button that led to it
    const next: TourHotspots["scenes"] = {};
    for (const [k, list] of Object.entries(hotspots.scenes)) {
      if (k === sceneId) continue;
      next[k] = list.filter((l) => l.target !== sceneId);
    }
    await saveLinks(next, hotspots.startScene === sceneId ? undefined : hotspots.startScene);
    void reload();
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
                  <small>{buildScenes360(p.scenes.map((x) => x.path)).length} site scenes · {p.villa360} inside-villa photos</small>
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
                  <p>Equirectangular panoramas (2:1). Name them 1.jpg, 2.jpg… — the number is the order in the strip. Then click a panorama to place the buttons that lead from one scene to another.</p>
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
                <span className={scenes.length ? "done" : ""}><i>1</i>Upload panoramas</span>
                <span className={linkCount ? "done" : ""}><i>2</i>Place hotspots ({linkCount})</span>
                <span className={open.villa360 ? "done" : ""}><i>3</i>Inside-villa 360</span>
                <span className={open.published ? "done" : ""}><i>4</i>Publish</span>
              </div>

              {scenes.length ? (
                <div className="axa-scenes">
                  {scenes.map((s, i) => {
                    const n = hotspots.scenes[s.id]?.length ?? 0;
                    return (
                      <figure key={s.id} className="axa-scene">
                        <button type="button" className="axa-scene-img" onClick={() => setEditing(s.id)} title="Edit hotspots">
                          <img src={s.thumbUrl || s.url} alt="" loading="lazy" />
                          {hotspots.startScene === s.id && <em className="axa-scene-start">Start</em>}
                        </button>
                        <figcaption>
                          <span className="axa-scene-n">{i + 1}</span>
                          <span title={s.label}>{s.label || s.id}</span>
                          <button type="button" className={`axa-scene-links${n ? " has" : ""}`} onClick={() => setEditing(s.id)} title="Edit hotspots">
                            <AiLink size={14} />
                            {n}
                          </button>
                          <button type="button" className="icon-btn danger" aria-label="Delete scene" onClick={() => void remove(s.id, s.label || s.id)}><AiTrash size={15} /></button>
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              ) : (
                <p className="axa-empty">No site panoramas yet for this project.</p>
              )}
              {scenes.length > 1 && (
                <p className="muted axa-tip">Click a panorama to open the hotspot editor: click inside the picture to add a button, then choose the scene it opens.</p>
              )}

              <footer className="axa-panel-foot">
                <span>Inside-villa 360 photos (per villa type, floor by floor): <b>{open.villa360}</b></span>
                <Link className="btn ghost" href={`/admin/complexes/${open.id}?tab=media`}>Manage inside-villa 360</Link>
                <span className={`axa-pill inline ${open.status === "active" ? "green" : open.status === "suspended" ? "red" : "orange"}`}><i />{open.status === "active" ? "Active" : open.status === "suspended" ? "Suspended" : "Pending"}</span>
              </footer>
            </section>
          )}
        </div>
      )}
      {editing && open && scenes.length > 0 && (
        <SceneLinkEditor
          scenes={scenes}
          links={hotspots.scenes}
          startScene={hotspots.startScene}
          initialScene={editing}
          saving={saving}
          onSave={saveLinks}
          onClose={() => setEditing(null)}
        />
      )}
      {dialog}
    </AdminShell>
  );
}
