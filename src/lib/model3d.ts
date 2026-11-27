/**
 * The real 3D model (the 3D viewer, webgl project) and its pins, set in GLB Studio.
 * Saved per project in the media bucket:
 *   <slug>/model3d/interactive.glb      the model (the "Interactive" export: full project + invisible villa shapes)
 *   <slug>/model3d/pins/<id>-<t>.webp   pin pictures
 *   <slug>/config/model-pins.json       { modelUrl, pins } — read by the 3D viewer
 * The format of a pin is the viewer's own (webgl/public/viewer/hotspots.js).
 */

export const MODEL_ICONS = ["mosque", "school", "park", "play", "building", "home", "water", "road", "plane"] as const;
export type ModelIcon = (typeof MODEL_ICONS)[number];

export type ModelPin = {
  id: string;
  icon: ModelIcon;
  title: string;
  /** point on the model, in the model's own units (cm) */
  at: [number, number, number];
  text: string[];
  facts?: string[];
  /** picture in the info panel: a full URL, or "places/<id>.webp" shipped with the viewer */
  photo?: string;
  /** the view the camera flies to: direction (x, z) from the place, degrees above the ground, distance (cm) */
  cam?: { look?: [number, number, number]; dir: [number, number]; elev: number; dist: number };
  /** how far the camera stops when there is no prepared view (cm) */
  view?: number;
  /** a place outside the project: only the info opens, the camera does not fly */
  far?: boolean;
  snap?: boolean;
  villa?: boolean;
  minElev?: number;
};

export type ModelConfig = {
  version: 1;
  /** uploaded model; null = the viewer keeps its own file */
  modelUrl: string | null;
  /** null = never edited (the viewer keeps its built-in pins) */
  pins: ModelPin[] | null;
  updatedAt?: string;
};

export const EMPTY_MODEL_CONFIG: ModelConfig = { version: 1, modelUrl: null, pins: null };
export const modelConfigPath = (slug: string) => `${slug}/config/model-pins.json`;
export const modelDir = (slug: string) => `${slug}/model3d`;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : undefined);
const vec = (v: unknown, n: number) => {
  if (!Array.isArray(v) || v.length !== n) return null;
  const out = v.map(num);
  return out.some((x) => x === null) ? null : (out as number[]);
};
const lines = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
    .map((x) => str(x, 800)?.trim())
    .filter((x): x is string => !!x)
    .slice(0, max);

export function cleanModelConfig(raw: unknown): ModelConfig {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const modelUrl = str(src.modelUrl, 1000);
  let pins: ModelPin[] | null = null;
  if (Array.isArray(src.pins)) {
    pins = src.pins
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        const at = vec(o.at, 3);
        const title = str(o.title, 80)?.trim();
        if (!at || !title) return null;
        const icon = (MODEL_ICONS as readonly string[]).includes(String(o.icon)) ? (o.icon as ModelIcon) : "building";
        const c = (o.cam && typeof o.cam === "object" ? o.cam : null) as Record<string, unknown> | null;
        const dir = c ? vec(c.dir, 2) : null;
        const elev = c ? num(c.elev) : null;
        const dist = c ? num(c.dist) : null;
        const look = c ? vec(c.look, 3) : null;
        const photo = str(o.photo, 1000);
        const pin: ModelPin = {
          id: (str(o.id, 40) || Math.random().toString(36).slice(2, 10)).replace(/[^\w-]/g, ""),
          icon,
          title,
          at: at as [number, number, number],
          text: lines(o.text, 6),
          facts: lines(o.facts, 8),
          ...(photo && (/^https:\/\//.test(photo) || /^places\/[\w-]+\.webp$/.test(photo)) ? { photo } : {}),
          ...(dir && elev !== null && dist !== null
            ? { cam: { ...(look ? { look: look as [number, number, number] } : {}), dir: dir as [number, number], elev, dist } }
            : {}),
          ...(num(o.view) !== null ? { view: num(o.view)! } : {}),
          ...(o.far === true ? { far: true, snap: true } : {}),
          ...(o.villa === true ? { villa: true } : {}),
          ...(num(o.minElev) !== null ? { minElev: num(o.minElev)! } : {}),
        };
        return pin;
      })
      .filter(Boolean) as ModelPin[];
  }
  return {
    version: 1,
    modelUrl: modelUrl && /^https:\/\//.test(modelUrl) ? modelUrl : null,
    pins,
    updatedAt: str(src.updatedAt, 40),
  };
}
