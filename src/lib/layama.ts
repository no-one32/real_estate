/**
 * Villa walk-through import: turns the 3D designer's Layama export folder
 * (layama.scene.js + mesh.glb + jpg/base/<size>/<id>_<face>.<ext>) into the files the tour reads,
 * stored in the media bucket under <slug>/visite360/.
 */
import type { TourCamera, TourData, TourFloor } from "@/viewer/Visite360Engine";

export const walkthroughDir = (slug: string) => `${slug}/visite360`;

const FACES = ["px", "nx", "py", "ny", "pz", "nz"] as const;
const FLOOR_NAMES = ["الدور الأرضي", "الدور الأول", "الدور الثاني", "الدور الثالث", "الدور الرابع"];

/** A file path inside the walk-through folder that may be uploaded. */
export function isWalkthroughFile(rel: string) {
  return rel === "mesh.glb" || rel === "tour.json" || /^(1024|2048|4096)\/[\w-]{1,40}_(px|nx|py|ny|pz|nz)\.(webp|jpg|jpeg)$/i.test(rel);
}

const vec = (body: string, key: string): [number, number, number] | null => {
  const m = new RegExp(`\\b${key}:\\s*\\{\\s*x:\\s*(-?[\\d.e+-]+),\\s*y:\\s*(-?[\\d.e+-]+),\\s*z:\\s*(-?[\\d.e+-]+)\\s*\\}`).exec(body);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** Reads the cameras (standing points) and settings out of layama.scene.js — the text only, nothing is run. */
export function parseLayamaScene(js: string): { cameras: TourCamera[]; resolutions: string[]; controls: TourData["controls"] } {
  const cameras: TourCamera[] = [];
  for (const m of js.matchAll(/layamaCameras\.push\(\{([\s\S]*?)\}\);/g)) {
    const body = m[1];
    const n = /\bn:\s*"([^"]+)"/.exec(body)?.[1];
    const a = /\ba:\s*"([^"]*)"/.exec(body)?.[1] ?? "";
    const p = vec(body, "p");
    const l = vec(body, "l");
    const c = /\bc:\s*\[([\d,\s]*)\]/.exec(body)?.[1];
    if (!n || !p || !l) continue;
    cameras.push({ n, a, p, l, ...(c ? { c: c.split(",").filter((x) => x.trim()).map(Number) } : {}) });
  }
  const resolutions = [...js.matchAll(/layamaResolutions\.push\("(\d+)"\)/g)].map((m) => m[1]);
  const ctl = /defMove:\s*(true|false),\s*defRot:\s*(\d+),\s*altMove:\s*(true|false),\s*altRot:\s*(\d+)/.exec(js);
  const controls = ctl ? { defMove: ctl[1] === "true", defRot: Number(ctl[2]), altMove: ctl[3] === "true", altRot: Number(ctl[4]) } : undefined;
  return { cameras, resolutions, controls };
}

/**
 * Floors from the camera heights: a floor is a height shared by several points (±30 cm);
 * points on the stairs (in-between heights) go to the nearest floor.
 */
export function floorsFromHeights(cameras: TourCamera[]): TourFloor[] {
  const hs = cameras.map((c) => c.p[1]).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const h of hs) {
    const last = groups[groups.length - 1];
    if (last && h - last[last.length - 1] <= 30) last.push(h);
    else groups.push([h]);
  }
  let levels = groups.filter((g) => g.length >= 2).map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  if (!levels.length) levels = [hs[0] ?? 0];
  const levelOf = (y: number) => levels.reduce((best, l, i) => (Math.abs(y - l) < Math.abs(y - levels[best]) ? i : best), 0);
  return levels.map((_, i) => ({
    id: `f${i + 1}`,
    label: FLOOR_NAMES[i] ?? `الدور ${i + 1}`,
    rooms: cameras.filter((c) => levelOf(c.p[1]) === i).map((c) => c.n),
  }));
}

/** tour.json for an imported export. Rooms bar = only the points the admin names (none yet). */
export function buildWalkthroughTour(js: string, imageExt: string, sizes: string[]): TourData {
  const { cameras, resolutions, controls } = parseLayamaScene(js);
  const floors = floorsFromHeights(cameras);
  for (const f of floors) for (const id of f.rooms) {
    const cam = cameras.find((c) => c.n === id);
    if (cam) cam.floor = f.id;
  }
  const res = (resolutions.length ? resolutions : ["2048", "1024"]).filter((r) => sizes.includes(r));
  return {
    version: 2,
    unitScale: 0.01,
    resolutions: res.length ? res : sizes,
    imageExt,
    mesh: "mesh.glb",
    startCamera: cameras[0]?.n,
    controls: controls ?? { defMove: false, defRot: 1, altMove: true, altRot: 2 },
    floors: floors.map((f) => ({ ...f, rooms: [] })),
    cameras,
  } as TourData;
}

/** After the admin names points: each floor's rooms bar lists its named points. */
export function withRoomBar(tour: TourData): TourData {
  return {
    ...tour,
    floors: tour.floors.map((f) => ({ ...f, rooms: tour.cameras.filter((c) => c.floor === f.id && c.lb?.trim()).map((c) => c.n) })),
  };
}

/** Which files of a picked folder to upload, and under which name. Prefers .webp images (lighter). */
export function pickWalkthroughFiles(files: File[]) {
  const rel = (f: File) => (f.webkitRelativePath || f.name).replace(/\\/g, "/");
  const scene = files.find((f) => /(^|\/)layama\.scene\.js$/i.test(rel(f)));
  const mesh = files.find((f) => /(^|\/)mesh\.glb$/i.test(rel(f)));
  const images = new Map<string, File>(); // "2048/10000_px" → file
  let webp = 0;
  for (const f of files) {
    const m = /(?:^|\/)(1024|2048|4096)\/([\w-]{1,40}_(?:px|nx|py|ny|pz|nz))\.(webp|jpe?g)$/i.exec(rel(f));
    if (!m) continue;
    const key = `${m[1]}/${m[2]}`;
    const isWebp = m[3].toLowerCase() === "webp";
    if (isWebp) webp += 1;
    const had = images.get(key);
    if (!had || (isWebp && !/\.webp$/i.test(had.name))) images.set(key, f);
  }
  // one extension for the whole tour (the viewer asks for <id>_<face><ext>)
  const ext = webp >= images.size / 2 && webp > 0 ? ".webp" : ".jpg";
  const upload: { path: string; file: File }[] = [];
  const sizes = new Set<string>();
  for (const [key, f] of images) {
    const fileExt = /\.webp$/i.test(f.name) ? ".webp" : ".jpg";
    if (fileExt !== ext) continue;
    upload.push({ path: `${key}${ext}`, file: f });
    sizes.add(key.split("/")[0]);
  }
  return { scene, mesh, ext, upload, sizes: [...sizes].sort((a, b) => Number(b) - Number(a)), faces: FACES.length };
}
