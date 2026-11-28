"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AdminShell from "../../AdminShell";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { AssetKind, AssetRow, ComplexRow, LeadRow, UnitRow, UnitStatus } from "@/lib/types";
import { displayPersonName } from "@/lib/person-name";
import { uploadAssets, type BrandSlot } from "@/lib/admin-upload";
import { assetFileLabel, assetRelSegments } from "@/lib/asset-path";
import { IconEye, IconFolder, IconTrash } from "@/components/Icons";
import { useConfirm } from "@/components/ConfirmDialog";
import { AiCamera, AiCube, AiGlobe, AiGridView, AiHome, AiImage, AiUpload } from "../../AdminIcons";

/** The picture on each upload card. */
const STEP_ICON: Record<string, (p: { size?: number }) => React.ReactNode> = {
  "branding-agency": AiImage,
  "branding-project": AiImage,
  glb: AiCube,
  frame_low: AiCamera,
  gallery: AiImage,
  villa_360: AiHome,
  plan: AiGridView,
  frame_high: AiCamera,
  document: (p) => <IconFolder size={p.size} />,
};

const UPLOAD_STEPS: {
  id: AssetKind;
  key: string;
  title: string;
  why: string;
  pick: "folder" | "files";
  action: string;
  brandSlot?: BrandSlot;
}[] = [
  {
    id: "branding",
    key: "branding-agency",
    title: "Agency logo",
    why: "Your agency logo — PNG with a transparent background.",
    pick: "files",
    action: "Add agency logo",
    brandSlot: "agency",
  },
  {
    id: "branding",
    key: "branding-project",
    title: "Project logo",
    why: "The project's logo — PNG with a transparent background.",
    pick: "files",
    action: "Add project logo",
    brandSlot: "project",
  },
  { id: "glb", key: "glb", title: "3D model", why: "The project's 3D file: building.glb.", pick: "files", action: "Add model" },
  { id: "frame_low", key: "frame_low", title: "Orbit photos", why: "The folder of 90 aerial photos taken all around the project.", pick: "folder", action: "Add folder" },
  { id: "gallery", key: "gallery", title: "Gallery", why: "A cover photo, plus an exterior folder and an interior folder.", pick: "folder", action: "Add folder" },
  {
    id: "scene_360",
    key: "scene_360",
    title: "Site 360 scenes",
    why: "The street 360° photos (2:1 panoramas), named 1.jpg, 2.jpg…",
    pick: "folder",
    action: "Add panoramas",
  },
  { id: "plan", key: "plan", title: "Plans", why: "A folder with the villa type plans and the floor plans.", pick: "folder", action: "Add folder" },
  { id: "villa_360", key: "villa_360", title: "Inside 360", why: "One folder per villa type with the turning-view images: ground floor, each floor, whole villa.", pick: "folder", action: "Add folder" },
  { id: "frame_high", key: "frame_high", title: "Sharp aerials", why: "The same 90 aerial photos, in high quality.", pick: "folder", action: "Add folder" },
  { id: "document", key: "document", title: "Private", why: "Contracts and private PDF files (never shown on the tour).", pick: "files", action: "Add files" },
];

function brandingSlotOf(path: string): BrandSlot | "" {
  const name = path.split("?")[0].split("/").pop()?.toLowerCase() || "";
  if (name.startsWith("agency.")) return "agency";
  if (name.startsWith("project.")) return "project";
  return "";
}

export default function ComplexAdminPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cx, setCx] = useState<ComplexRow | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [clients, setClients] = useState<{ id: string; email: string | null; full_name: string | null }[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [pickClient, setPickClient] = useState("");
  const [busyKind, setBusyKind] = useState<AssetKind | null>(null);
  const [busyProgress, setBusyProgress] = useState("");
  const [filesKind, setFilesKind] = useState<AssetKind | null>(null);
  const [filesDir, setFilesDir] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const search = useSearchParams();
  const [tab, setTab] = useState<"units" | "media" | "leads" | "qr">(() => {
    const t = search.get("tab");
    return t === "media" || t === "leads" || t === "qr" ? t : "units";
  });
  const { confirm, dialog } = useConfirm();
  const qrSrc = useMemo(() => (cx ? `/api/qr?slug=${cx.slug}` : ""), [cx]);
  const filesBrowse = useMemo(() => {
    if (!filesKind) {
      return { nested: false, folders: [] as { name: string; count: number }[], files: [] as { name: string; row: AssetRow }[] };
    }
    const rows = assets.filter((a) => a.kind === filesKind || (filesKind === "document" && a.kind === "other"));
    const split = rows.map((row) => ({ row, parts: assetRelSegments(row.path, filesKind) }));
    const nested = split.some((s) => s.parts.length >= 3);
    if (!nested) {
      const files = split
        .map((s) => ({ name: s.parts[s.parts.length - 1] || assetFileLabel(s.row.path), row: s.row }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      return { nested: false, folders: [], files };
    }
    const prefix = filesDir;
    const folderMap = new Map<string, number>();
    const files: { name: string; row: AssetRow }[] = [];
    for (const { row, parts } of split) {
      if (prefix.some((p, i) => parts[i] !== p)) continue;
      if (parts.length === prefix.length + 1) {
        files.push({ name: parts[parts.length - 1], row });
      } else if (parts.length > prefix.length + 1) {
        const name = parts[prefix.length];
        folderMap.set(name, (folderMap.get(name) ?? 0) + 1);
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const folders = [...folderMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { nested: true, folders, files };
  }, [assets, filesKind, filesDir]);

  const load = async () => {
    const sb = createBrowserSupabase();
    if (!sb) {
      setErr("Supabase is not configured");
      return;
    }
    const [{ data: complex }, { data: unitRows }, { data: leadRows }, { data: assetRows }, clRes, memRes] = await Promise.all([
      sb.from("complexes").select("*").eq("id", id).single(),
      sb.from("units").select("*").eq("complex_id", id).order("display_id"),
      sb.from("leads").select("*").eq("complex_id", id).order("created_at", { ascending: false }).limit(200),
      sb.from("assets").select("*").eq("complex_id", id).order("sort_index"),
      fetch("/api/admin/clients"),
      fetch(`/api/admin/complexes/${id}/members`),
    ]);
    setCx(complex as ComplexRow | null);
    setUnits((unitRows as UnitRow[]) ?? []);
    setLeads((leadRows as LeadRow[]) ?? []);
    setAssets((assetRows as AssetRow[]) ?? []);
    const clJson = await clRes.json();
    if (clRes.ok) setClients(clJson.clients ?? []);
    const memJson = await memRes.json();
    if (memRes.ok) setMemberIds(memJson.memberIds ?? []);
    else if ((complex as ComplexRow | null)?.owner_id) setMemberIds([(complex as ComplexRow).owner_id!]);
  };

  useEffect(() => {
    void load();
  }, [id]);

  const saveComplex = async (patch: Partial<ComplexRow>) => {
    const sb = createBrowserSupabase();
    if (!sb || !cx) return;
    const { data, error } = await sb.from("complexes").update(patch).eq("id", cx.id).select("*").single();
    if (error) setErr(error.message);
    else setCx(data as ComplexRow);
  };

  const removeProject = async () => {
    if (!cx) return;
    if (!(await confirm(`Delete ${cx.name}? Villas, photos, and this tour go with it. Clients stay.`, "Delete project"))) return;
    const res = await fetch("/api/admin/complexes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cx.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not delete");
    else router.push("/admin");
  };

  const addAssigned = async () => {
    if (!pickClient || !id) return;
    const res = await fetch(`/api/admin/complexes/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: pickClient }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Could not add client");
      return;
    }
    setMemberIds(json.memberIds ?? []);
    setPickClient("");
  };

  const removeAssigned = async (profileId: string) => {
    const res = await fetch(`/api/admin/complexes/${id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Could not remove client");
      return;
    }
    setMemberIds(json.memberIds ?? []);
  };

  const saveStatus = async (unitId: string, status: UnitStatus) => {
    const sb = createBrowserSupabase();
    if (!sb) return;
    const { error } = await sb.from("units").update({ status }).eq("id", unitId);
    if (error) setErr(error.message);
    else setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, status } : u)));
  };

  const importUnits = async (file: File | null) => {
    if (!file || !id) return;
    setMsg("");
    setErr("");
    let parsed: { units?: unknown };
    try {
      parsed = JSON.parse(await file.text()) as { units?: unknown };
    } catch {
      setErr("That file is not valid JSON");
      return;
    }
    const unitsList = Array.isArray(parsed.units) ? parsed.units : Array.isArray(parsed) ? parsed : [];
    if (!unitsList.length) {
      setErr("No units array in that file");
      return;
    }
    const res = await fetch("/api/admin/import-units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: id, units: unitsList }),
    });
    const json = await res.json();
    if (!res.ok) setErr(json.error || "Import failed");
    else {
      setMsg(`Imported ${json.count} units`);
      void load();
    }
  };

  const removeUnit = async (unitId: string) => {
    const unit = units.find((u) => u.id === unitId);
    if (!(await confirm(`Remove villa ${unit?.display_id || ""}?`, "Remove villa"))) return;
    const sb = createBrowserSupabase();
    if (!sb) return;
    const { error } = await sb.from("units").delete().eq("id", unitId);
    if (error) setErr(error.message);
    else setUnits((prev) => prev.filter((u) => u.id !== unitId));
  };

  const clearUnits = async () => {
    const sb = createBrowserSupabase();
    if (!sb || !cx || !units.length) return;
    if (!(await confirm(`Delete all ${units.length} units? You can import another units.json after.`, "Remove villas"))) return;
    const { error } = await sb.from("units").delete().eq("complex_id", cx.id);
    if (error) setErr(error.message);
    else {
      setUnits([]);
      setMsg("All units removed");
    }
  };

  const openPrivate = async (objectPath: string) => {
    const sb = createBrowserSupabase();
    if (!sb) return;
    const { data, error } = await sb.storage.from("private").createSignedUrl(objectPath, 300);
    if (error || !data?.signedUrl) setErr(error?.message || "Could not sign URL");
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const removeAsset = async (row: AssetRow) => {
    if (!(await confirm(`Delete this file?`, "Delete file"))) return;
    const res = await fetch("/api/admin/assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not delete");
    else setAssets((prev) => prev.filter((a) => a.id !== row.id));
  };

  const clearKind = async (target: AssetKind) => {
    if (!cx) return;
    const rows = assets.filter((a) => a.kind === target || (target === "document" && a.kind === "other"));
    if (!rows.length) return;
    if (!(await confirm(`Remove all ${rows.length} file(s) from this card?`, "Remove files"))) return;
    const res = await fetch("/api/admin/assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: cx.id, kind: target }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not delete");
    else {
      setMsg(`Removed ${json.count ?? rows.length} file(s)`);
      if (filesKind === target) setFilesKind(null);
      void load();
    }
  };

  const upload = async (files: File[], nextKind: AssetKind, brandSlot?: BrandSlot) => {
    if (!cx) return;
    setErr("");
    setMsg("");
    setBusyKind(nextKind);
    const res = await uploadAssets(cx.id, files, nextKind, {
      brandSlot,
      onProgress: (done, total) => setBusyProgress(`${done} / ${total}`),
    });
    setBusyKind(null);
    setBusyProgress("");
    if (res.error) setErr(res.error);
    if (res.ok) setMsg(`${res.ok} file(s) saved`);
    void load();
  };

  if (!cx) {
    return (
      <AdminShell>
        <p className="muted">{err || "Loading…"}</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <p className="crumb"><Link href="/admin">Portals</Link> / {cx.name}</p>
      <header className="page-head project-head">
        <h1>{cx.name}</h1>
        <button className="icon-btn danger" type="button" title="Delete project" aria-label="Delete project" onClick={() => void removeProject()}>
          <IconTrash size={18} />
        </button>
      </header>
      <div className="tabs-inline">
        <a className={tab === "units" ? "on" : ""} href="#units" onClick={(e) => { e.preventDefault(); setTab("units"); }}>Units</a>
        <a className={tab === "media" ? "on" : ""} href="#media" onClick={(e) => { e.preventDefault(); setTab("media"); }}>Photos & logos</a>
        <a className={tab === "leads" ? "on" : ""} href="#leads" onClick={(e) => { e.preventDefault(); setTab("leads"); }}>Leads ({leads.length})</a>
        <a className={tab === "qr" ? "on" : ""} href="#qr" onClick={(e) => { e.preventDefault(); setTab("qr"); }}>Code</a>
        <Link href={`/digital-twins/${cx.slug}`}>View tour</Link>
      </div>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      <form className="settings-row" onSubmit={(e) => e.preventDefault()}>
        <label>Name <input value={cx.name} onChange={(e) => setCx({ ...cx, name: e.target.value })} onBlur={() => void saveComplex({ name: cx.name })} /></label>
        <label>
          City
          <input
            value={cx.city ?? ""}
            placeholder="Khamis Mushait"
            onChange={(e) => setCx({ ...cx, city: e.target.value })}
            onBlur={() => void saveComplex({ city: cx.city?.trim() || null })}
          />
        </label>
        <label>
          Short description
          <input
            value={cx.description ?? ""}
            placeholder="Modern living in the heart of the city"
            maxLength={80}
            onChange={(e) => setCx({ ...cx, description: e.target.value })}
            onBlur={() => void saveComplex({ description: cx.description?.trim() || null })}
          />
        </label>
        <label>
          Visibility
          <select value={cx.published ? "1" : "0"} onChange={(e) => void saveComplex({ published: e.target.value === "1" })}>
            <option value="0">Hidden</option>
            <option value="1">Live</option>
          </select>
        </label>
      </form>
      <div className="assign-box">
        <h3>Clients on this project</h3>
        <p>You can add more than one. Each person signs in and sees this development.</p>
        <div className="assign-list">
          {clients.filter((cl) => memberIds.includes(cl.id)).map((cl) => (
            <span key={cl.id} className="assign-chip">
              {displayPersonName(cl.full_name, cl.email)}
              <button type="button" onClick={() => void removeAssigned(cl.id)} aria-label="Remove">×</button>
            </span>
          ))}
          {!memberIds.length && <span className="muted">None yet</span>}
        </div>
        {clients.some((cl) => !memberIds.includes(cl.id)) && (
          <div className="assign-add">
            <select value={pickClient} onChange={(e) => setPickClient(e.target.value)}>
              <option value="">Add a client…</option>
              {clients.filter((cl) => !memberIds.includes(cl.id)).map((cl) => (
                <option key={cl.id} value={cl.id}>{displayPersonName(cl.full_name, cl.email)} ({cl.email})</option>
              ))}
            </select>
            <button className="btn" type="button" disabled={!pickClient} onClick={() => void addAssigned()}>Add</button>
          </div>
        )}
      </div>

      {tab === "units" && (
        <section className="units-panel">
          <header className="units-toolbar">
            <div>
              <h2>Units</h2>
              <p>Choose the villas file for this project.</p>
            </div>
            <div className="units-actions">
              {units.length > 0 && <span className="units-count">{units.length}</span>}
              <label className="file-pick">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void importUnits(file);
                  }}
                />
                <span>Import villas</span>
              </label>
              {units.length > 0 && (
                <button className="icon-btn danger" type="button" title="Remove all villas" aria-label="Remove all villas" onClick={() => void clearUnits()}>
                  <IconTrash size={16} />
                </button>
              )}
            </div>
          </header>
          <div className="table-wrap units-table">
          <table>
            <thead>
              <tr><th>ID</th><th>Area</th><th>Type</th><th>Price</th><th>Floor</th><th>Rooms</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="unit-id">{u.display_id}</td>
                  <td>{u.surface} m²</td>
                  <td><span className="type-pill">{u.model || (u.type === 1 ? "1A" : u.type === 2 ? "2A" : u.type === 3 ? "3A" : `T${u.type}`)}</span></td>
                  <td>{(u.price || 0).toLocaleString("en-US")} ر.س</td>
                  <td>{u.floor}</td>
                  <td>{u.rooms}</td>
                  <td>
                    <select
                      className={`status-select status-${u.status}`}
                      value={u.status}
                      onChange={(e) => void saveStatus(u.id, e.target.value as UnitStatus)}
                    >
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                      <option value="sold">Sold</option>
                    </select>
                  </td>
                  <td>
                    <button className="icon-btn danger" type="button" title="Remove villa" aria-label="Remove villa" onClick={() => void removeUnit(u.id)}>
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {!units.length && <p className="units-empty">No villas yet. Import a file to add them.</p>}
        </section>
      )}

      {tab === "media" && (
        <>
          <h2>Photos & files</h2>
          <p className="muted">Use each card in order. Only open the folder named on that card.</p>
          <div className="upload-grid">
            {UPLOAD_STEPS.map((step) => {
              const rows = assets.filter((a) => {
                if (step.id === "document") return a.kind === "document" || a.kind === "other";
                if (step.id !== a.kind) return false;
                if (!step.brandSlot) return true;
                const slot = brandingSlotOf(a.path);
                return slot === step.brandSlot || (!slot && step.brandSlot === "agency" && !assets.some((x) => x.kind === "branding" && brandingSlotOf(x.path) === "agency"));
              });
              const n = rows.length;
              const preview = step.brandSlot ? rows.find((a) => a.path.startsWith("http")) : undefined;
              const folderPick = step.pick === "folder";
              return (
                <article key={step.key} className={`upload-card up2${n ? " has" : ""}`}>
                  <span className={`up2-ico${preview ? " logo" : ""}`}>
                    {preview ? <img src={preview.path} alt="" /> : (() => { const I = STEP_ICON[step.key] ?? STEP_ICON[step.id] ?? AiGlobe; return <I size={22} />; })()}
                  </span>
                  <div className="up2-body">
                    <h3>
                      {step.title}
                      <em className={n ? "has" : ""}>{n ? `${n} file${n > 1 ? "s" : ""}` : "Empty"}</em>
                    </h3>
                    <p>{step.why}</p>
                  </div>
                  <div className="up2-actions">
                    <label className={`upload-pick${n ? " soft" : ""}`}>
                      <input
                      type="file"
                      multiple={folderPick}
                      accept={step.id === "branding" ? "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" : step.id === "glb" ? ".glb,model/gltf-binary" : step.id === "document" ? ".pdf,application/pdf" : undefined}
                      disabled={busyKind !== null}
                      ref={(el) => {
                        if (!el) return;
                        if (folderPick) el.setAttribute("webkitdirectory", "");
                        else el.removeAttribute("webkitdirectory");
                      }}
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        void upload(list, step.id, step.brandSlot);
                      }}
                    />
                      <AiUpload size={15} />
                      <span>{busyKind === step.id && (!step.brandSlot || busyProgress) ? (busyProgress ? `Adding ${busyProgress}` : "Adding…") : step.action}</span>
                    </label>
                    <div className="upload-icons">
                      <button className="icon-btn" type="button" disabled={!n} title="View files" aria-label="View files" onClick={() => { setFilesKind(step.id); setFilesDir([]); }}>
                        <IconEye size={16} />
                      </button>
                      <button
                        className="icon-btn danger"
                        type="button"
                        disabled={!n}
                        title={step.brandSlot ? "Remove this logo" : "Remove all"}
                        aria-label={step.brandSlot ? "Remove this logo" : "Remove all"}
                        onClick={() => {
                          if (step.brandSlot) {
                            void (async () => {
                              for (const row of rows) await removeAsset(row);
                            })();
                            return;
                          }
                          void clearKind(step.id);
                        }}
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {filesKind && (
            <div className="files-sheet" onClick={() => { setFilesKind(null); setFilesDir([]); }}>
              <div className="files-panel" onClick={(e) => e.stopPropagation()}>
                <header>
                  <div>
                    <h3>{UPLOAD_STEPS.find((s) => s.id === filesKind)?.title}</h3>
                    {filesBrowse.nested ? (
                      <nav className="files-crumb">
                        <button type="button" className={!filesDir.length ? "on" : ""} onClick={() => setFilesDir([])}>Root</button>
                        {filesDir.map((name, i) => (
                          <span key={`${name}-${i}`}>
                            <em>/</em>
                            <button type="button" className={i === filesDir.length - 1 ? "on" : ""} onClick={() => setFilesDir(filesDir.slice(0, i + 1))}>{name}</button>
                          </span>
                        ))}
                      </nav>
                    ) : (
                      <p>{filesBrowse.files.length} files</p>
                    )}
                  </div>
                  <button className="icon-btn" type="button" aria-label="Close" onClick={() => { setFilesKind(null); setFilesDir([]); }}>×</button>
                </header>
                {filesBrowse.nested && (
                  <ul className="files-folders">
                    {filesBrowse.folders.map((folder) => (
                      <li key={folder.name}>
                        <button type="button" className="folder-row" onClick={() => setFilesDir([...filesDir, folder.name])}>
                          <IconFolder size={18} />
                          <strong>{folder.name}</strong>
                          <small>{folder.count}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <ul>
                  {filesBrowse.files.map(({ name, row: a }) => (
                    <li key={a.id}>
                      <span title={a.path}>{name}</span>
                      <div className="icon-actions">
                        <button className="icon-btn" type="button" title="Open" aria-label="Open" onClick={() => a.path.startsWith("http") ? window.open(a.path, "_blank", "noopener,noreferrer") : void openPrivate(a.path)}>
                          <IconEye size={16} />
                        </button>
                        <button className="icon-btn danger" type="button" title="Delete" aria-label="Delete" onClick={() => void removeAsset(a)}>
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "leads" && (
        <>
          <h2>Leads</h2>
          <table>
            <thead><tr><th>Date</th><th>Last name</th><th>First name</th><th>Email</th><th>Phone</th><th>Villa</th><th>Favourites</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleString()}</td>
                  <td>{l.nom}</td>
                  <td>{l.prenom}</td>
                  <td>{l.email}</td>
                  <td>{l.tel}</td>
                  <td>{l.unit_display_id}</td>
                  <td>{l.favorite_units?.length ? l.favorite_units.join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!leads.length && <p className="muted">No leads yet.</p>}
        </>
      )}

      {tab === "qr" && (
        <>
          <h2>Visitor code</h2>
          <p className="muted">Print this. Visitors scan it to open the tour.</p>
          <img src={qrSrc} alt="QR" width={280} height={280} />
          <p><a className="btn" href={qrSrc} download={`${cx.slug}-qr.png`}>Download</a></p>
        </>
      )}
      {dialog}
    </AdminShell>
  );
}
