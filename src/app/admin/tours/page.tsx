"use client";

import { useEffect, useState } from "react";
import AdminShell from "../AdminShell";
import { COMPLEX, visite360Base, visite360ImageBase, visite360TourUrl } from "@/lib/complex";
import { EMPTY_HOTSPOTS, type InsideHotspot, type TourHotspots } from "@/lib/hotspots";
import type { TourData } from "@/viewer/Visite360Engine";
import InsideBuilder, { type WalkthroughSource } from "./InsideBuilder";
import WalkthroughImport from "./WalkthroughImport";
import { usePortals } from "../usePortals";

/** Villas Ajyad's walk-through ships with the site (not imported). */
const BUILT_IN = COMPLEX.slug;

export default function ToursPage() {
  const { portals, ready, err, setErr } = usePortals();
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const open = portals.find((p) => p.id === (openId ?? portals.find((x) => x.slug === BUILT_IN)?.id ?? portals[0]?.id)) ?? null;

  const [hotspots, setHotspots] = useState<TourHotspots | null>(null);
  // undefined = loading; null = no walk-through yet
  const [source, setSource] = useState<WalkthroughSource | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setHotspots(null);
    setSource(undefined);
    void fetch(`/api/admin/hotspots?complexId=${open.id}`)
      .then((r) => r.json())
      .then((j) => alive && setHotspots(j.hotspots ?? EMPTY_HOTSPOTS));
    if (open.slug === BUILT_IN) {
      setSource({ tourUrl: visite360TourUrl(), base: visite360Base(), imageBase: visite360ImageBase(), imported: false });
    } else {
      void fetch(`/api/admin/walkthrough?complexId=${open.id}`)
        .then((r) => r.json())
        .then((j) => alive && setSource(j.base ? { tourUrl: `${j.base}/tour.json?v=${Date.now()}`, base: j.base, imageBase: j.base, imported: true } : null));
    }
    return () => {
      alive = false;
    };
  }, [open?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (inside: InsideHotspot[]) => {
    if (!open) return false;
    setSaving(true);
    setErr("");
    setMsg("");
    const res = await fetch("/api/admin/hotspots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: open.id, inside }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(json.error || "Could not save");
      return false;
    }
    setHotspots(json.hotspots);
    setMsg("Saved — the hotspots now appear inside the villa on the tour.");
    return true;
  };

  const saveTour = async (tour: TourData) => {
    if (!open) return false;
    setSaving(true);
    setErr("");
    const res = await fetch("/api/admin/walkthrough", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: open.id, tour }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(json.error || "Could not save the room names");
      return false;
    }
    setMsg("Room names saved.");
    return true;
  };

  return (
    <AdminShell>
      <header className="axa-head axa-head-row">
        <div>
          <h1>360° Tour Builder</h1>
          <p>Import the villa walk-through, name the rooms and place the buttons (Majlis, Kitchen…) that take visitors to each room.</p>
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
      {open && source === null && (
        <WalkthroughImport
          complexId={open.id}
          projectName={open.name}
          onDone={() => {
            setMsg("Walk-through imported. Now name the rooms and place the hotspots.");
            setVersion((v) => v + 1);
          }}
          onError={setErr}
        />
      )}
      {open && source && hotspots && (
        <>
          <InsideBuilder
            key={`${open.id}-${version}`}
            projectSlug={open.slug}
            source={source}
            onSaveTour={source.imported ? saveTour : undefined}
            saved={hotspots.inside ?? null}
            saving={saving}
            onSave={save}
          />
          {source.imported && (
            <details className="axa-reimport">
              <summary>Replace this walk-through with a new export</summary>
              <WalkthroughImport complexId={open.id} projectName={open.name} onDone={() => setVersion((v) => v + 1)} onError={setErr} />
            </details>
          )}
        </>
      )}
    </AdminShell>
  );
}
