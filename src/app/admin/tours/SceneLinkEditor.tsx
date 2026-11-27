"use client";

import { useMemo, useState } from "react";
import AdminPanoViewer from "./AdminPanoViewer";
import { newId, type SceneLink } from "@/lib/hotspots";
import type { TourScene360 } from "@/lib/tour";
import { AiTrash } from "../AdminIcons";

type Props = {
  scenes: TourScene360[];
  /** scene id → buttons (all scenes, edited here then saved together) */
  links: Record<string, SceneLink[]>;
  startScene: string | undefined;
  initialScene: string;
  saving: boolean;
  onSave: (links: Record<string, SceneLink[]>, startScene: string | undefined) => Promise<boolean>;
  onClose: () => void;
};

/** Full-screen editor: look around a panorama, click to drop a button, pick the scene it opens. */
export default function SceneLinkEditor({ scenes, links: initial, startScene: initialStart, initialScene, saving, onSave, onClose }: Props) {
  const [links, setLinks] = useState(initial);
  const [start, setStart] = useState(initialStart);
  const [sceneId, setSceneId] = useState(initialScene);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const scene = scenes.find((s) => s.id === sceneId) ?? scenes[0];
  const mine = links[scene.id] ?? [];
  const labelOf = (id: string) => scenes.find((s) => s.id === id)?.label || id;
  const others = useMemo(() => scenes.filter((s) => s.id !== scene.id), [scenes, scene.id]);

  const setMine = (next: SceneLink[]) => {
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
    const target = (others.find((s) => !used.has(s.id)) ?? others[0]).id;
    const link: SceneLink = { id: newId(), lon, lat, target };
    setMine([...mine, link]);
    setSelected(link.id);
  };

  const goScene = (id: string) => {
    setSceneId(id);
    setSelected(null);
    setPlacing(null);
  };

  return (
    <div className="axa-editor" role="dialog" aria-label="360 hotspots">
      <div className="axa-editor-view">
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
          {placing ? "Click where this button should go" : others.length ? "Drag to look around · click on the picture to add a button" : "Upload at least two scenes to link them"}
        </div>
        <div className="axa-editor-strip">
          {scenes.map((s) => (
            <button key={s.id} type="button" className={s.id === scene.id ? "on" : ""} onClick={() => goScene(s.id)} title={s.label}>
              <img src={s.thumbUrl || s.url} alt="" loading="lazy" />
              <span>{s.label || s.id}</span>
              {(links[s.id]?.length ?? 0) > 0 && <i>{links[s.id].length}</i>}
              {start === s.id && <em>Start</em>}
            </button>
          ))}
        </div>
      </div>

      <aside className="axa-editor-side">
        <header>
          <div>
            <small>Scene</small>
            <h2>{scene.label || scene.id}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => (!dirty || confirm("Close without saving?")) && onClose()}>×</button>
        </header>

        <label className="axa-check">
          <input
            type="checkbox"
            checked={start === scene.id}
            onChange={(e) => {
              setStart(e.target.checked ? scene.id : undefined);
              setDirty(true);
            }}
          />
          Start the 360 tour on this scene
        </label>

        <h3>Buttons in this scene ({mine.length})</h3>
        {!mine.length && <p className="muted">None yet. Click on the panorama where a door or path leads to another place.</p>}
        <ul className="axa-links">
          {mine.map((l, i) => (
            <li key={l.id} className={l.id === selected ? "on" : ""} onClick={() => setSelected(l.id)}>
              <span className="axa-scene-n">{i + 1}</span>
              <div>
                <label>
                  Goes to
                  <select value={l.target} onChange={(e) => setMine(mine.map((x) => (x.id === l.id ? { ...x, target: e.target.value } : x)))}>
                    {others.map((s) => (
                      <option key={s.id} value={s.id}>{s.label || s.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Label (optional)
                  <input
                    value={l.label ?? ""}
                    maxLength={40}
                    placeholder={labelOf(l.target)}
                    onChange={(e) => setMine(mine.map((x) => (x.id === l.id ? { ...x, label: e.target.value || undefined } : x)))}
                  />
                </label>
                <div className="axa-link-actions">
                  <button type="button" className="btn ghost small" onClick={() => setPlacing(placing === l.id ? null : l.id)}>
                    {placing === l.id ? "Cancel move" : "Move"}
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => goScene(l.target)}>Open target</button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label="Delete button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMine(mine.filter((x) => x.id !== l.id));
                    }}
                  >
                    <AiTrash size={15} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <footer>
          <button type="button" className="btn ghost" onClick={() => (!dirty || confirm("Close without saving?")) && onClose()}>Close</button>
          <button
            type="button"
            className="btn"
            disabled={saving || !dirty}
            onClick={() => void onSave(links, start).then((ok) => ok && setDirty(false))}
          >
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
