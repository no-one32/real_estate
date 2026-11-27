"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";
import { useConfirm } from "@/components/ConfirmDialog";
import { uploadAssets } from "@/lib/admin-upload";
import { assetFileLabel } from "@/lib/asset-path";
import { usePortals, type PortalOverview } from "../usePortals";
import { buildScenes360 } from "@/lib/tour";
import type { MapPin } from "@/lib/hotspots";
import { STREET_360_PINS } from "@/lib/street360";
import GlbPinEditor from "./GlbPinEditor";
import { AiCube, AiEye, AiLink, AiPin, AiTrash, AiUpload } from "../AdminIcons";

/** Above this a GLB is slow on phones; it should be compressed (Draco / meshopt, smaller textures) before upload. */
const HEAVY_MB = 25;

function useSizes(urls: string[]) {
  const [sizes, setSizes] = useState<Record<string, number | null>>({});
  const key = urls.join("|");
  useEffect(() => {
    let alive = true;
    for (const url of urls) {
      if (url in sizes) continue;
      void fetch(url, { method: "HEAD" })
        .then((r) => Number(r.headers.get("content-length")) || null)
        .catch(() => null)
        .then((n) => alive && setSizes((s) => ({ ...s, [url]: n })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return sizes;
}

export default function GlbStudioPage() {
  const { portals, ready, err, setErr, reload } = usePortals();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const { confirm, dialog } = useConfirm();
  const [pinsFor, setPinsFor] = useState<{ p: PortalOverview; pins: MapPin[] } | null>(null);
  const [savingPins, setSavingPins] = useState(false);

  const openPins = async (p: PortalOverview) => {
    setErr("");
    const res = await fetch(`/api/admin/hotspots?complexId=${p.id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(json.error || "Could not load pins");
    // nothing changed yet: start from the pins the tour already has
    const builtIn = (STREET_360_PINS[p.slug] ?? []).map((x): MapPin => ({ id: x.sceneId, pos: x.pos, kind: "scene", sceneId: x.sceneId }));
    setPinsFor({ p, pins: json.hotspots?.mapPins ?? builtIn });
  };
  const savePins = async (pins: MapPin[]) => {
    if (!pinsFor) return false;
    setSavingPins(true);
    const res = await fetch("/api/admin/hotspots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: pinsFor.p.id, mapPins: pins }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingPins(false);
    if (!res.ok) {
      setErr(json.error || "Could not save");
      return false;
    }
    setMsg(`${pins.length} pin(s) saved for ${pinsFor.p.name}`);
    return true;
  };

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return portals.filter((p) => !n || p.name.toLowerCase().includes(n));
  }, [portals, q]);
  const sizes = useSizes(portals.flatMap((p) => p.glb.map((g) => g.path)).filter((u) => u.startsWith("http")));
  const withModel = portals.filter((p) => p.glb.length).length;
  const totalMb = Object.values(sizes).reduce<number>((s, n) => s + (n ?? 0), 0) / 1e6;

  const add = async (complexId: string, name: string, files: File[]) => {
    setErr("");
    setMsg("");
    setBusy(complexId);
    const res = await uploadAssets(complexId, files, "glb");
    setBusy(null);
    if (res.error) setErr(res.error);
    if (res.ok) setMsg(`Model uploaded to ${name}`);
    void reload();
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this 3D model? The tour can no longer tell which villa was tapped.", "Delete model"))) return;
    const res = await fetch("/api/admin/assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not delete");
    else void reload();
  };

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setMsg("Link copied");
  };

  return (
    <AdminShell search={q} onSearch={setQ} searchPlaceholder="Search projects…">
      <header className="axa-head">
        <div>
          <h1>WebGL / GLB Studio</h1>
          <p>Upload the 3D model of each project, check its weight for the web and share its link.</p>
        </div>
      </header>

      <div className="axa-stats three">
        <article className="axa-stat violet">
          <span className="axa-stat-ico"><AiCube /></span>
          <div><b>{withModel}</b><small>Projects with a model</small></div>
          <em className="axa-trend muted">of {portals.length}</em>
        </article>
        <article className="axa-stat blue">
          <span className="axa-stat-ico"><AiUpload /></span>
          <div><b>{totalMb ? `${totalMb.toFixed(1)} MB` : "—"}</b><small>Total model size</small></div>
        </article>
        <article className="axa-stat orange">
          <span className="axa-stat-ico"><AiEye /></span>
          <div><b>{Object.values(sizes).filter((n) => (n ?? 0) / 1e6 > HEAVY_MB).length}</b><small>Heavy models (&gt; {HEAVY_MB} MB)</small></div>
        </article>
      </div>

      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}
      {!ready && <p className="muted">Loading…</p>}

      <div className="axa-table">
        <div className="axa-tr axa-th">
          <span>Project</span>
          <span>Model</span>
          <span>Size</span>
          <span>Web ready</span>
          <span />
        </div>
        {shown.map((p) => {
          const g = p.glb[0];
          const size = g ? sizes[g.path] : undefined;
          const mb = size ? size / 1e6 : null;
          return (
            <div key={p.id} className="axa-tr">
              <span className="axa-td-project">
                <span className="axa-list-ico"><AiCube size={18} /></span>
                <b>{p.name}</b>
              </span>
              <span className="axa-td-file" title={g?.path}>{g ? assetFileLabel(g.path) : <em className="muted">No model</em>}</span>
              <span>{g ? (mb === null || mb === undefined ? "…" : `${mb.toFixed(1)} MB`) : "—"}</span>
              <span>
                {g ? (
                  mb !== null && mb !== undefined && mb > HEAVY_MB ? (
                    <span className="axa-pill inline orange"><i />Compress</span>
                  ) : (
                    <span className="axa-pill inline green"><i />Good</span>
                  )
                ) : (
                  "—"
                )}
              </span>
              <span className="axa-td-actions">
                {g && (
                  <>
                    <button type="button" className="btn ghost small" title="Place clickable pins on the 3D model" onClick={() => void openPins(p)}>
                      <AiPin size={15} />
                      Edit pins
                    </button>
                    <a className="icon-btn" href={`/digital-twins/${p.slug}`} target="_blank" rel="noreferrer" title="Open in tour" aria-label="Open in tour"><AiEye size={16} /></a>
                    <button type="button" className="icon-btn" title="Copy model link" aria-label="Copy model link" onClick={() => void copy(g.path)}><AiLink size={16} /></button>
                    <button type="button" className="icon-btn danger" title="Delete model" aria-label="Delete model" onClick={() => void remove(g.id)}><AiTrash size={16} /></button>
                  </>
                )}
                <label className={`btn small${busy ? " disabled" : ""}`}>
                  <input
                    type="file"
                    hidden
                    accept=".glb,model/gltf-binary"
                    disabled={!!busy}
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      void add(p.id, p.name, list);
                    }}
                  />
                  <AiUpload size={15} />
                  {busy === p.id ? "Uploading…" : g ? "Replace" : "Upload GLB"}
                </label>
              </span>
            </div>
          );
        })}
      </div>

      {pinsFor && pinsFor.p.glb[0] && (
        <GlbPinEditor
          glbUrl={pinsFor.p.glb[0].path}
          projectName={pinsFor.p.name}
          scenes={buildScenes360(pinsFor.p.scenes.map((s) => s.path))}
          pins={pinsFor.pins}
          saving={savingPins}
          onSave={savePins}
          onClose={() => setPinsFor(null)}
        />
      )}
      {dialog}
    </AdminShell>
  );
}
