/**
 * Hotspots a project's admin places by hand:
 *  - scene links inside the 360 panoramas (click → go to another scene)
 *  - pins on the 3D maquette (click → open a 360 scene, show an info card, or open a link)
 * Saved as one JSON file per project in the media bucket: <slug>/config/hotspots.json
 */

/** A button inside a panorama. lon/lat are the viewer's look angles in degrees (see PanoramaViewer). */
export type SceneLink = {
  id: string;
  lon: number;
  lat: number;
  /** id of the scene it opens (TourScene360.id) */
  target: string;
  label?: string;
};

export type MapPinKind = "scene" | "info" | "link";

/** A pin on the aerial maquette, in the GLB's world coordinates. */
export type MapPin = {
  id: string;
  pos: [number, number, number];
  kind: MapPinKind;
  sceneId?: string;
  title?: string;
  text?: string;
  url?: string;
};

/** What a hotspot inside the villa (walk-through 360) does when clicked. */
export type InsideKind = "room" | "info" | "link";

/** A hotspot inside the villa, at a wall / floor point in the walk-through's own units (Layama cm). */
export type InsideHotspot = {
  id: string;
  pos: [number, number, number];
  kind: InsideKind;
  /** camera id of the room it walks to (kind "room") */
  room?: string;
  title?: string;
  text?: string;
  url?: string;
};

export type TourHotspots = {
  version: 1;
  /** scene shown first when the 360 view opens */
  startScene?: string;
  /** scene id → its buttons */
  scenes: Record<string, SceneLink[]>;
  /** null = never edited (the tour keeps its built-in pins) */
  mapPins: MapPin[] | null;
  /** hotspots inside the villa walk-through; null = never edited */
  inside?: InsideHotspot[] | null;
  updatedAt?: string;
};

export const EMPTY_HOTSPOTS: TourHotspots = { version: 1, scenes: {}, mapPins: null, inside: null };

/** Inside hotspots in the walk-through engine's format (mode 5 = walk to a room, 1 = info card, 3 = new tab). */
export function insideForEngine(list: InsideHotspot[]) {
  return list.map((h) => ({
    id: h.id,
    name: h.title || h.id,
    pos: h.pos,
    mode: (h.kind === "room" ? 5 : h.kind === "link" ? 3 : 1) as 1 | 3 | 5,
    url: h.kind === "room" ? h.room : h.kind === "link" ? h.url : undefined,
    title: h.title,
    text: h.text,
  }));
}

export const hotspotsPath = (slug: string) => `${slug}/config/hotspots.json`;

export const newId = () => Math.random().toString(36).slice(2, 10);

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Accept only well-formed data (it comes from the browser on save and from storage on load). */
export function cleanHotspots(raw: unknown): TourHotspots {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const scenes: Record<string, SceneLink[]> = {};
  const rawScenes = (src.scenes && typeof src.scenes === "object" ? src.scenes : {}) as Record<string, unknown>;
  for (const [sceneId, list] of Object.entries(rawScenes)) {
    if (!Array.isArray(list)) continue;
    const links = list
      .map((l) => {
        const o = (l ?? {}) as Record<string, unknown>;
        const lon = num(o.lon);
        const lat = num(o.lat);
        const target = str(o.target, 120);
        if (lon === null || lat === null || !target) return null;
        return { id: str(o.id, 40) || newId(), lon, lat: Math.max(-89, Math.min(89, lat)), target, label: str(o.label, 80) || undefined };
      })
      .filter(Boolean) as SceneLink[];
    if (links.length) scenes[sceneId.slice(0, 120)] = links;
  }
  let mapPins: MapPin[] | null = null;
  if (Array.isArray(src.mapPins)) {
    mapPins = src.mapPins
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        const pos = Array.isArray(o.pos) ? o.pos.map(num) : [];
        if (pos.length !== 3 || pos.some((n) => n === null)) return null;
        const kind: MapPinKind = o.kind === "info" || o.kind === "link" ? o.kind : "scene";
        const url = str(o.url, 1000);
        return {
          id: str(o.id, 40) || newId(),
          pos: pos as [number, number, number],
          kind,
          sceneId: str(o.sceneId, 120),
          title: str(o.title, 80),
          text: str(o.text, 600),
          url: url && /^https?:\/\//i.test(url) ? url : undefined,
        };
      })
      .filter(Boolean) as MapPin[];
  }
  let inside: InsideHotspot[] | null = null;
  if (Array.isArray(src.inside)) {
    inside = src.inside
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        const pos = Array.isArray(o.pos) ? o.pos.map(num) : [];
        if (pos.length !== 3 || pos.some((n) => n === null)) return null;
        const kind: InsideKind = o.kind === "info" || o.kind === "link" ? o.kind : "room";
        const url = str(o.url, 1000);
        return {
          id: str(o.id, 40) || newId(),
          pos: pos as [number, number, number],
          kind,
          room: str(o.room, 120),
          title: str(o.title, 80),
          text: str(o.text, 600),
          url: url && /^https?:\/\//i.test(url) ? url : undefined,
        };
      })
      .filter(Boolean) as InsideHotspot[];
  }
  return { version: 1, startScene: str(src.startScene, 120), scenes, mapPins, inside, updatedAt: str(src.updatedAt, 40) };
}
