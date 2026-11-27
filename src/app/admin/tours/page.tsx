"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";
import { useConfirm } from "@/components/ConfirmDialog";
import { uploadAssets } from "@/lib/admin-upload";
import { buildScenes360 } from "@/lib/tour";
import { EMPTY_HOTSPOTS, type TourHotspots } from "@/lib/hotspots";
import TourBuilder from "./TourBuilder";
import { usePortals } from "../usePortals";

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
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const { confirm, dialog } = useConfirm();

  const open = portals.find((p) => p.id === (openId ?? portals[0]?.id)) ?? null;
  // one scene per panorama (thumbnails grouped with it) — same ids as the public tour
  const scenes = useMemo(() => buildScenes360((open?.scenes ?? []).map((s) => s.path)), [open]);
  const assetIdsOf = (sceneId: string) => (open?.scenes ?? []).filter((a) => sceneIdOf(a.path) === sceneId).map((a) => a.id);

  const [hotspots, setHotspots] = useState<TourHotspots>(EMPTY_HOTSPOTS);
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
    setMsg("Saved — the hotspots now appear in the tour.");
    return true;
  };

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
    <AdminShell>
      <header className="axa-head axa-head-row">
        <div>
          <h1>360° Tour Builder</h1>
          <p>Import the 360 images, place the hotspots, choose where each one leads.</p>
        </div>
        {portals.length > 0 && (
          <label className="axa-project-pick">
            Project
            <select value={open?.id ?? ""} onChange={(e) => setOpenId(e.target.value)}>
              {portals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
      </header>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}
      {!ready && <p className="muted">Loading…</p>}
      {ready && !portals.length && <p className="axa-empty">Create a portal first, then build its 360 tour here.</p>}
      {open && (
        <TourBuilder
          key={open.id}
          projectSlug={open.slug}
          scenes={scenes}
          links={hotspots.scenes}
          startScene={hotspots.startScene}
          uploading={busy}
          saving={saving}
          onUpload={(files) => void add(files)}
          onDeleteScene={(id, label) => void remove(id, label)}
          onSave={saveLinks}
        />
      )}
      {dialog}
    </AdminShell>
  );
}
