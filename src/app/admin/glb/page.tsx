"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";
import { usePortals, type PortalOverview } from "../usePortals";
import RealModelEditor from "./RealModelEditor";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { EMPTY_MODEL_CONFIG, type ModelConfig, type ModelPin } from "@/lib/model3d";
import { BUILT_IN_MODEL_PINS } from "@/lib/model3d-builtin";
import { AiCube, AiEye, AiLink, AiPin, AiUpload } from "../AdminIcons";

/** Where the 3D viewer (webgl project) is online, e.g. https://3d.example.com — set in Vercel env. */
const VIEWER_URL = (process.env.NEXT_PUBLIC_3D_VIEWER_URL || "").replace(/\/$/, "");

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
  const { portals, ready, err, setErr } = usePortals();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");


  // ---- the real 3D model (3D viewer) of each project + its pins
  const [real, setReal] = useState<Record<string, ModelConfig>>({});
  const [realFor, setRealFor] = useState<{ p: PortalOverview; pins: ModelPin[]; modelUrl: string } | null>(null);
  const [savingReal, setSavingReal] = useState(false);
  const [realBusy, setRealBusy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    for (const p of portals) {
      void fetch(`/api/admin/model3d?complexId=${p.id}`)
        .then((r) => r.json())
        .then((j) => alive && setReal((all) => ({ ...all, [p.id]: j.config ?? EMPTY_MODEL_CONFIG })));
    }
    return () => {
      alive = false;
    };
  }, [portals]);
  const realSizes = useSizes(Object.values(real).map((c) => c.modelUrl).filter((u): u is string => !!u));

  const putReal = async (complexId: string, patch: Partial<ModelConfig>) => {
    const res = await fetch("/api/admin/model3d", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId, ...patch }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json.error || "Could not save");
      return false;
    }
    setReal((all) => ({ ...all, [complexId]: json.config }));
    return true;
  };

  const uploadReal = async (p: PortalOverview, file: File | undefined) => {
    if (!file) return;
    setErr("");
    setMsg("");
    if (!/\.glb$/i.test(file.name)) return setErr("Choose a .glb file (the Interactive export).");
    setRealBusy(p.id);
    try {
      const res = await fetch("/api/admin/model3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexId: p.id, kind: "model" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not start the upload");
      const up = await createBrowserSupabase()?.storage.from("media").uploadToSignedUrl(j.objectPath, j.token, file, { contentType: "model/gltf-binary", upsert: true });
      if (!up || up.error) throw new Error(up?.error?.message || "Upload failed");
      if (await putReal(p.id, { modelUrl: `${j.publicUrl}?v=${Date.now()}` })) setMsg(`3D model uploaded to ${p.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setRealBusy(null);
    }
  };

  const saveReal = async (pins: ModelPin[]) => {
    if (!realFor) return false;
    setSavingReal(true);
    const ok = await putReal(realFor.p.id, { pins });
    setSavingReal(false);
    if (ok) setMsg(`${pins.length} pin(s) saved — the 3D viewer shows them now.`);
    return ok;
  };

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return portals.filter((p) => !n || p.name.toLowerCase().includes(n));
  }, [portals, q]);
  const withModel = Object.values(real).filter((c) => c.modelUrl).length;
  const totalMb = Object.values(realSizes).reduce<number>((s, n) => s + (n ?? 0), 0) / 1e6;


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
          <div><b>{Object.values(realSizes).filter((n) => (n ?? 0) / 1e6 > HEAVY_MB).length}</b><small>Heavy models (&gt; {HEAVY_MB} MB)</small></div>
        </article>
      </div>

      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}
      {!ready && <p className="muted">Loading…</p>}

      <section className="axa-glb-sec">
        <h2>Real 3D model <small>the 3D viewer · pins like the mosque, the school…</small></h2>
        <div className="axa-table">
          <div className="axa-tr axa-th">
            <span>Project</span>
            <span>3D model</span>
            <span>Size</span>
            <span>Pins</span>
            <span />
          </div>
          {shown.map((p) => {
            const c = real[p.id];
            const size = c?.modelUrl ? realSizes[c.modelUrl] : undefined;
            const builtIn = BUILT_IN_MODEL_PINS[p.slug];
            const pinCount = c?.pins ? c.pins.length : builtIn?.length ?? 0;
            return (
              <div key={p.id} className="axa-tr">
                <span className="axa-td-project">
                  <span className="axa-list-ico"><AiCube size={18} /></span>
                  <b>{p.name}</b>
                </span>
                <span className="axa-td-file">{!c ? "…" : c.modelUrl ? "interactive.glb" : <em className="muted">Not uploaded</em>}</span>
                <span>{c?.modelUrl ? (size ? `${(size / 1e6).toFixed(1)} MB` : "…") : "—"}</span>
                <span>{c ? `${pinCount}${!c.pins && builtIn ? " (built-in)" : ""}` : "…"}</span>
                <span className="axa-td-actions">
                  {c?.modelUrl && (
                    <button
                      type="button"
                      className="btn ghost small"
                      title="Place the pins on the 3D model"
                      onClick={() => setRealFor({ p, modelUrl: c.modelUrl!, pins: c.pins ?? builtIn ?? [] })}
                    >
                      <AiPin size={15} />
                      Edit pins
                    </button>
                  )}
                  {c?.modelUrl && VIEWER_URL && (
                    <a className="icon-btn" href={`${VIEWER_URL}/viewer/?project=${p.slug}`} target="_blank" rel="noreferrer" title="Open the 3D viewer" aria-label="Open the 3D viewer"><AiEye size={16} /></a>
                  )}
                  {c?.modelUrl && (
                    <button type="button" className="icon-btn" title="Copy model link" aria-label="Copy model link" onClick={() => void copy(c.modelUrl!)}><AiLink size={16} /></button>
                  )}
                  <label className={`btn small${realBusy ? " disabled" : ""}`}>
                    <input
                      type="file"
                      hidden
                      accept=".glb,model/gltf-binary"
                      disabled={!!realBusy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        void uploadReal(p, f);
                      }}
                    />
                    <AiUpload size={15} />
                    {realBusy === p.id ? "Uploading…" : c?.modelUrl ? "Replace" : "Upload 3D model"}
                  </label>
                </span>
              </div>
            );
          })}
        </div>
      </section>


      {realFor && (
        <RealModelEditor
          complexId={realFor.p.id}
          modelUrl={realFor.modelUrl}
          projectName={realFor.p.name}
          pins={realFor.pins}
          saving={savingReal}
          onSave={saveReal}
          onClose={() => setRealFor(null)}
        />
      )}
    </AdminShell>
  );
}
