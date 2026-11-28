"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Visite360Engine, type TourData } from "@/viewer/Visite360Engine";
import { arabizeTour } from "@/components/Visite360Viewer";
import { insideForEngine, newId, type InsideHotspot, type InsideKind } from "@/lib/hotspots";
import { withRoomBar } from "@/lib/layama";
import { AiCamera, AiEye, AiPin, AiTrash } from "../AdminIcons";

/** Where the walk-through files are: the built-in one (Villas Ajyad) or one imported in the admin. */
export type WalkthroughSource = { tourUrl: string; base: string; imageBase: string; imported: boolean };

type Props = {
  projectSlug: string;
  source: WalkthroughSource;
  /** imported walk-throughs: saves tour.json with the room names */
  onSaveTour?: (tour: TourData) => Promise<boolean>;
  /** as saved; null = never edited */
  saved: InsideHotspot[] | null;
  saving: boolean;
  onSave: (list: InsideHotspot[]) => Promise<boolean>;
};

const KIND_LABEL: Record<InsideKind, string> = { room: "Go to a room", info: "Info card", link: "Open a link" };

/**
 * Hotspots inside the villa walk-through: walk to a room, click "Add hotspot", click the wall / door
 * where the button goes, then choose the room it leads to (Majlis, Kitchen…).
 */
export default function InsideBuilder({ projectSlug, source, onSaveTour, saved, saving, onSave }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Visite360Engine | null>(null);
  const [tour, setTour] = useState<TourData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [here, setHere] = useState("");

  const [list, setList] = useState<InsideHotspot[]>(saved ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<"new" | string | null>(null);
  const [dirty, setDirty] = useState(false);
  // imported walk-throughs: the admin names the points (المجلس، المطبخ…); named ones make the rooms bar
  const [names, setNames] = useState<Record<string, string>>({});
  const [namesDirty, setNamesDirty] = useState(false);
  const [floorNames, setFloorNames] = useState<Record<string, string>>({});
  // imported walk-throughs: the points the admin made rooms (with "+ Add room"), in the order added
  const [added, setAdded] = useState<string[]>([]);
  // the view each room opens on (where the admin was looking when adding it / "Use this view")
  const [looks, setLooks] = useState<Record<string, [number, number, number]>>({});

  useEffect(() => {
    setList(saved ?? []);
    setDirty(false);
  }, [saved]);

  // the walk-through, same files as the public tour
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let disposed = false;
    let engine: Visite360Engine | null = null;
    (async () => {
      try {
        const res = await fetch(source.tourUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`tour.json ${res.status}`);
        const raw = (await res.json()) as TourData;
        const data = source.imported ? raw : arabizeTour(raw);
        if (disposed) return;
        if (!source.imported) data.startCamera = "10000";
        setNames(Object.fromEntries(raw.cameras.map((c) => [c.n, c.lb ?? ""])));
        setAdded(raw.cameras.filter((c) => c.lb?.trim()).map((c) => c.n));
        data.hotspots = insideForEngine(saved ?? []);
        setTour(data);
        setHere(data.startCamera ?? data.cameras[0]?.n ?? "");
        engine = new Visite360Engine({
          canvas,
          overlay: host,
          baseUrl: source.base,
          imageBaseUrl: source.imageBase,
          tour: data,
          onArrive: (id) => !disposed && setHere(id),
          onFirstFrame: () => !disposed && setLoaded(true),
          onError: (m) => !disposed && setError(m),
          onHotspotClick: (def) => {
            if (def.id) {
              setSelected(def.id);
              setPlacing(null);
            }
            return true;
          },
        });
        engineRef.current = engine;
        await engine.start();
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "Could not load the walk-through");
      }
    })();
    return () => {
      disposed = true;
      engineRef.current = null;
      engine?.dispose();
    };
    // the engine is built once; later edits go through setHotspots
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // show the edits in the viewer at once
  useEffect(() => {
    if (loaded) engineRef.current?.setHotspots(insideForEngine(list));
  }, [list, loaded]);
  useEffect(() => {
    hostRef.current?.querySelectorAll<HTMLElement>(".v360-hotspot").forEach((el) => el.classList.toggle("is-sel", el.dataset.id === selected));
  }, [selected, list, loaded]);

  const cams = useMemo(() => new Map((tour?.cameras ?? []).map((c) => [c.n, c])), [tour]);
  const pointNo = useMemo(() => new Map((tour?.cameras ?? []).map((c, i) => [c.n, i + 1])), [tour]);
  const roomName = (id?: string) => {
    if (!id) return "—";
    const n = source.imported ? names[id]?.trim() : cams.get(id)?.lb;
    return n || `Point ${pointNo.get(id) ?? id}`;
  };
  // the rooms of each floor: built-in → its rooms list; imported → the points the admin added as rooms
  const floorPoints = (f: { id: string; rooms: string[] }) => (source.imported ? added.filter((id) => cams.get(id)?.floor === f.id) : f.rooms);
  const rooms = useMemo(
    () => (tour?.floors ?? []).flatMap((f) => floorPoints(f).map((id) => ({ id, label: roomName(id), floor: f.label }))),
    [tour, cams, names, added], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const keepView = (id: string) => {
    const look = engineRef.current?.currentLook();
    if (!look) return;
    engineRef.current?.setView(id, look);
    setLooks((all) => ({ ...all, [id]: look }));
    setNamesDirty(true);
  };
  // "+" next to a floor: the room is where you stand (with the view you see);
  // on another floor → jump to a free spot of that floor and add it there
  const addRoom = (floorId: string) => {
    let id = here;
    if (!id) return;
    if (cams.get(id)?.floor === floorId) {
      if (!added.includes(id)) {
        setAdded((all) => [...all, id]);
        keepView(id);
      }
    } else {
      const spots = (tour?.cameras ?? []).filter((c) => c.floor === floorId).map((c) => c.n);
      id = spots.find((x) => !added.includes(x)) ?? spots[0];
      if (!id) return;
      engineRef.current?.teleportTo(id);
      if (!added.includes(id)) setAdded((all) => [...all, id]);
      setNamesDirty(true);
    }
    setTimeout(() => hostRef.current?.closest(".axa-builder")?.querySelector<HTMLInputElement>(`input[data-room="${id}"]`)?.focus(), 0);
  };
  const removeRoom = (id: string) => {
    setAdded((all) => all.filter((x) => x !== id));
    setNames((all) => ({ ...all, [id]: "" }));
    setNamesDirty(true);
  };
  const sel = list.find((h) => h.id === selected) ?? null;

  const edit = (id: string, patch: Partial<InsideHotspot>) => {
    setList((all) => all.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    setDirty(true);
  };

  // click on the viewer while placing → the wall point under the mouse
  const place = (e: React.MouseEvent) => {
    const pos = engineRef.current?.pickAt(e.clientX, e.clientY);
    if (!pos) return;
    if (placing === "new") {
      const target = rooms.find((r) => r.id !== here) ?? rooms[0];
      const h: InsideHotspot = { id: newId(), pos, kind: "room", room: target?.id, title: target?.label };
      setList((all) => [...all, h]);
      setSelected(h.id);
    } else if (placing) {
      edit(placing, { pos });
    }
    setDirty(true);
    setPlacing(null);
  };

  return (
    <div className="axa-builder">
      {/* rooms */}
      <aside className="axa-builder-scenes">
        <h3 className="axa-builder-h">Rooms</h3>
        {source.imported && <p className="muted axa-room-tip">Stand in the room, face the view, click <b>+</b>.</p>}
        <ul className="axa-room-list">
          {(tour?.floors ?? []).map((f) => (
            <li key={f.id}>
              {source.imported ? (
                <div className="axa-floor-row">
                <input
                  className="axa-floor-name"
                  dir="auto"
                  size={Math.max(6, (floorNames[f.id] ?? f.label).length + 1)}
                  value={floorNames[f.id] ?? f.label}
                  maxLength={30}
                  aria-label="Floor name"
                  onChange={(e) => {
                    setFloorNames((all) => ({ ...all, [f.id]: e.target.value }));
                    setNamesDirty(true);
                  }}
                />
                <button type="button" className="axa-floor-add" title="Add a room on this floor" aria-label="Add a room on this floor" disabled={!loaded} onClick={() => addRoom(f.id)}>+</button>
                </div>
              ) : (
                <small>{f.label}</small>
              )}
              {floorPoints(f).map((id) =>
                source.imported ? (
                  <div key={id} className={`axa-room-edit${id === here ? " on" : ""}`}>
                    <button type="button" title="Go there" onClick={() => engineRef.current?.teleportTo(id)}>{pointNo.get(id)}</button>
                    <input
                      dir="auto"
                      data-room={id}
                      value={names[id] ?? ""}
                      maxLength={40}
                      placeholder="Name this room…"
                      onFocus={() => id !== here && engineRef.current?.teleportTo(id)}
                      onChange={(e) => {
                        setNames((all) => ({ ...all, [id]: e.target.value }));
                        setNamesDirty(true);
                      }}
                    />
                    <button type="button" className="axa-room-view" title="Use the view you see now for this room" aria-label="Use this view" disabled={id !== here} onClick={() => keepView(id)}><AiCamera size={15} /></button>
                    <button type="button" className="axa-room-del" title="Remove this room" aria-label="Remove this room" onClick={() => removeRoom(id)}>−</button>
                  </div>
                ) : (
                  <button key={id} type="button" className={id === here ? "on" : ""} onClick={() => engineRef.current?.teleportTo(id)}>
                    {roomName(id)}
                    {list.some((h) => h.kind === "room" && h.room === id) && <em title="A hotspot leads here">●</em>}
                  </button>
                ),
              )}
            </li>
          ))}
        </ul>
        {!tour && !error && <p className="muted">Loading the villa…</p>}
      </aside>

      {/* walk-through */}
      <section className="axa-builder-view">
        <div className="visite360 axa-inside-view" ref={hostRef}>
          <canvas ref={canvasRef} className="visite360-canvas" />
          {!loaded && !error && (
            <div className="visite360-loading">
              <span className="visite360-spinner" />
              <span>Loading the walk-through…</span>
            </div>
          )}
          {error && <div className="visite360-error">{error}</div>}
          {placing && <div className="axa-place-layer" onClick={place} />}
        </div>
        <div className="axa-inside-bar">
          <button type="button" className={`btn${placing === "new" ? " ghost" : ""}`} disabled={!loaded} onClick={() => setPlacing(placing === "new" ? null : "new")}>
            <AiPin size={16} />
            {placing === "new" ? "Cancel" : "Add hotspot"}
          </button>
          <span className="axa-editor-hint">
            {placing ? "Click the wall or door where the button goes" : `You are in: ${roomName(here)} · click the floor to walk, drag to look`}
          </span>
        </div>
      </section>

      {/* hotspots */}
      <aside className="axa-builder-props">
        <header>
          <small>Inside the villa</small>
          <h2>Hotspots ({list.length})</h2>
        </header>
        <ul className="axa-links">
          {list.map((h, i) => (
            <li key={h.id} className={h.id === selected ? "on" : ""} onClick={() => setSelected(h.id)}>
              <span className="axa-scene-n">{i + 1}</span>
              <div>
                <b>{h.title || roomName(h.room)}</b>
                <small className="muted">{h.kind === "room" ? `→ ${roomName(h.room)}` : KIND_LABEL[h.kind]}</small>
              </div>
            </li>
          ))}
        </ul>
        {!list.length && <p className="muted">Click “Add hotspot”, then click a door or wall. Choose the room it leads to (المجلس، المطبخ…).</p>}

        {sel && (
          <div className="axa-pin-form">
            <h3>Selected hotspot</h3>
            <label>
              Click does
              <select value={sel.kind} onChange={(e) => edit(sel.id, { kind: e.target.value as InsideKind })}>
                {(Object.keys(KIND_LABEL) as InsideKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </label>
            {sel.kind === "room" && (
              <label>
                Goes to
                <select
                  value={sel.room ?? ""}
                  onChange={(e) => {
                    const old = roomName(sel.room);
                    // the button text follows the room unless it was typed by hand
                    edit(sel.id, { room: e.target.value, ...(!sel.title || sel.title === old ? { title: roomName(e.target.value) } : {}) });
                  }}
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.label} · {r.floor}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Button text
              <input value={sel.title ?? ""} maxLength={40} dir="auto" placeholder={roomName(sel.room)} onChange={(e) => edit(sel.id, { title: e.target.value || undefined })} />
            </label>
            {sel.kind === "info" && (
              <label>
                Text
                <textarea rows={3} dir="auto" value={sel.text ?? ""} maxLength={600} onChange={(e) => edit(sel.id, { text: e.target.value || undefined })} />
              </label>
            )}
            {sel.kind === "link" && (
              <label>
                Link
                <input value={sel.url ?? ""} placeholder="https://…" onChange={(e) => edit(sel.id, { url: e.target.value || undefined })} />
              </label>
            )}
            <div className="axa-link-actions">
              <button type="button" className="btn ghost small" onClick={() => setPlacing(placing === sel.id ? null : sel.id)}>{placing === sel.id ? "Cancel" : "Move"}</button>
              {sel.kind === "room" && sel.room && (
                <button type="button" className="btn ghost small" onClick={() => engineRef.current?.teleportTo(sel.room!)}>Go there</button>
              )}
              <button
                type="button"
                className="icon-btn danger"
                aria-label="Delete hotspot"
                onClick={() => {
                  setList((all) => all.filter((x) => x.id !== sel.id));
                  setSelected(null);
                  setDirty(true);
                }}
              >
                <AiTrash size={15} />
              </button>
            </div>
          </div>
        )}

        <footer>
          <a className="btn ghost" href={`/digital-twins/${projectSlug}`} target="_blank" rel="noreferrer"><AiEye size={16} />Preview</a>
          <button
            type="button"
            className="btn"
            disabled={saving || (!dirty && !namesDirty)}
            onClick={() =>
              void (async () => {
                if (namesDirty && tour && onSaveTour) {
                  const named = withRoomBar({
                    ...tour,
                    floors: tour.floors.map((f) => ({ ...f, label: floorNames[f.id]?.trim() || f.label })),
                    cameras: tour.cameras.map((c) => ({ ...c, lb: names[c.n]?.trim() || undefined, ...(looks[c.n] ? { l: looks[c.n] } : {}) })),
                  });
                  if (!(await onSaveTour(named))) return;
                  setNamesDirty(false);
                }
                if (dirty && (await onSave(list))) setDirty(false);
              })()
            }
          >
            {saving ? "Saving…" : dirty || namesDirty ? "Save" : "Saved"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
