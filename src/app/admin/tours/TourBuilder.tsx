"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPanoViewer from "./AdminPanoViewer";
import { newId, type SceneLink } from "@/lib/hotspots";
import type { TourScene360 } from "@/lib/tour";
import { AiEye, AiTrash, AiUpload } from "../AdminIcons";

type Props = {
  projectSlug: string;
  scenes: TourScene360[];
  /** scene id → hotspots, as saved */
  links: Record<string, SceneLink[]>;
  startScene: string | undefined;
  uploading: string;
  saving: boolean;
  onUpload: (files: File[]) => void;
  onDeleteScene: (sceneId: string, label: string) => void;
  onSave: (links: Record<string, SceneLink[]>, startScene: string | undefined) => Promise<boolean>;
};

/**
 * The 360 builder workspace: scenes on the left (import images here), the panorama in the middle
 * (click to place a hotspot), the selected hotspot's settings on the right.
 */
export default function TourBuilder({ projectSlug, scenes, links: saved, startScene: savedStart, uploading, saving, onUpload, onDeleteScene, onSave }: Props) {
  const [links, setLinks] = useState(saved);
  const [start, setStart] = useState(savedStart);
  const [sceneId, setSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // a new project / fresh data from the server
  useEffect(() => {
    setLinks(saved);
    setStart(savedStart);
    setDirty(false);
  }, [saved, savedStart]);
  useEffect(() => {
    if (!scenes.some((s) => s.id === sceneId)) setSceneId(scenes[0]?.id ?? null);
  }, [scenes, sceneId]);

  const scene = scenes.find((s) => s.id === sceneId) ?? null;
  const mine = scene ? links[scene.id] ?? [] : [];
  const sel = mine.find((l) => l.id === selected) ?? null;
  const labelOf = (id: string) => scenes.find((s) => s.id === id)?.label || id;
  const others = useMemo(() => scenes.filter((s) => s.id !== scene?.id), [scenes, scene]);

  const setMine = (next: SceneLink[]) => {
    if (!scene) return;
    setLinks((all) => ({ ...all, [scene.id]: next }));
    setDirty(true);
  };

  const pick = (lon: number, lat: number) => {
    if (placing) {
      setMine(mine.map((l) => (l.id === placing ? { ...l, lon, lat } : l)));
      setPlacing(null);
      return;
    }
    if (!others.length) return;
    const used = new Set(mine.map((l) => l.target));
    const link: SceneLink = { id: newId(), lon, lat, target: (others.find((s) => !used.has(s.id)) ?? others[0]).id };
    setMine([...mine, link]);
    setSelected(link.id);
  };

  const goScene = (id: string) => {
    setSceneId(id);
    setSelected(null);
    setPlacing(null);
  };

  const filesFrom = (list: FileList | null) => Array.from(list ?? []).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));

  return (
    <div className="axa-builder">
      {/* scenes + import */}
      <aside className="axa-builder-scenes">
        <label
          className={`axa-drop${dragOver ? " over" : ""}${uploading ? " busy" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const files = filesFrom(e.dataTransfer.files);
            if (files.length && !uploading) onUpload(files);
          }}
        >
          <input
            type="file"
            multiple
            hidden
            accept="image/jpeg,image/png,image/webp"
            disabled={!!uploading}
            onChange={(e) => {
              const files = filesFrom(e.target.files);
              e.target.value = "";
              if (files.length) onUpload(files);
            }}
          />
          <AiUpload size={20} />
          <b>{uploading || "Import 360 images"}</b>
          <small>Drop panoramas here (2:1) · 1.jpg, 2.jpg…</small>
        </label>

        <ul className="axa-scene-list">
          {scenes.map((s, i) => (
            <li key={s.id} className={s.id === scene?.id ? "on" : ""}>
              <button type="button" className="axa-scene-pick" onClick={() => goScene(s.id)}>
                <img src={s.thumbUrl || s.url} alt="" loading="lazy" />
                <span className="axa-scene-n">{i + 1}</span>
                {start === s.id && <em>Start</em>}
              </button>
              <div>
                <b>{s.label || s.id}</b>
                <small>{(links[s.id]?.length ?? 0) === 1 ? "1 hotspot" : `${links[s.id]?.length ?? 0} hotspots`}</small>
              </div>
              <button type="button" className="icon-btn danger" aria-label="Delete scene" onClick={() => onDeleteScene(s.id, s.label || s.id)}>
                <AiTrash size={15} />
              </button>
            </li>
          ))}
        </ul>
        {!scenes.length && <p className="muted">No scenes yet. Import the 360 images of this project.</p>}
      </aside>

      {/* panorama */}
      <section className="axa-builder-view">
        {scene ? (
          <>
            <AdminPanoViewer
              src={scene.url}
              links={mine.map((l) => ({ id: l.id, lon: l.lon, lat: l.lat, label: l.label || labelOf(l.target), active: l.id === selected }))}
              onLink={(id) => {
                setSelected(id);
                setPlacing(null);
              }}
              onPick={pick}
            />
            <div className="axa-editor-hint">
              {placing ? "Click where this hotspot should go" : others.length ? "Drag to look around · click to place a hotspot" : "Import at least two scenes to link them"}
            </div>
          </>
        ) : (
          <div className="axa-builder-empty">Import 360 images to start building the tour.</div>
        )}
      </section>

      {/* properties */}
      <aside className="axa-builder-props">
        <header>
          <small>Scene</small>
          <h2>{scene ? scene.label || scene.id : "—"}</h2>
        </header>
        {scene && (
          <label className="axa-check">
            <input
              type="checkbox"
              checked={start === scene.id}
              onChange={(e) => {
                setStart(e.target.checked ? scene.id : undefined);
                setDirty(true);
              }}
            />
            Start the tour here
          </label>
        )}

        <h3>Hotspots ({mine.length})</h3>
        <ul className="axa-links">
          {mine.map((l, i) => (
            <li key={l.id} className={l.id === selected ? "on" : ""} onClick={() => setSelected(l.id)}>
              <span className="axa-scene-n">{i + 1}</span>
              <div>
                <b>{l.label || labelOf(l.target)}</b>
                <small className="muted">→ {labelOf(l.target)}</small>
              </div>
            </li>
          ))}
        </ul>
        {!mine.length && scene && <p className="muted">Click on the panorama where a door or path leads to another scene.</p>}

        {sel && (
          <div className="axa-pin-form">
            <h3>Selected hotspot</h3>
            <label>
              Goes to
              <select value={sel.target} onChange={(e) => setMine(mine.map((x) => (x.id === sel.id ? { ...x, target: e.target.value } : x)))}>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>{s.label || s.id}</option>
                ))}
              </select>
            </label>
            <label>
              Label
              <input
                value={sel.label ?? ""}
                maxLength={40}
                placeholder={labelOf(sel.target)}
                onChange={(e) => setMine(mine.map((x) => (x.id === sel.id ? { ...x, label: e.target.value || undefined } : x)))}
              />
            </label>
            <div className="axa-link-actions">
              <button type="button" className="btn ghost small" onClick={() => setPlacing(placing === sel.id ? null : sel.id)}>{placing === sel.id ? "Cancel" : "Move"}</button>
              <button type="button" className="btn ghost small" onClick={() => goScene(sel.target)}>Open target</button>
              <button
                type="button"
                className="icon-btn danger"
                aria-label="Delete hotspot"
                onClick={() => {
                  setMine(mine.filter((x) => x.id !== sel.id));
                  setSelected(null);
                }}
              >
                <AiTrash size={15} />
              </button>
            </div>
          </div>
        )}

        <footer>
          <a className="btn ghost" href={`/digital-twins/${projectSlug}`} target="_blank" rel="noreferrer"><AiEye size={16} />Preview</a>
          <button type="button" className="btn" disabled={saving || !dirty} onClick={() => void onSave(links, start).then((ok) => ok && setDirty(false))}>
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
