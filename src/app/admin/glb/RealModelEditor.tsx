"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { MODEL_ICONS, type ModelIcon, type ModelPin } from "@/lib/model3d";
import { newId } from "@/lib/hotspots";

type Props = {
  complexId: string;
  modelUrl: string;
  projectName: string;
  pins: ModelPin[];
  saving: boolean;
  onSave: (pins: ModelPin[]) => Promise<boolean>;
  onClose: () => void;
};

const ICON_LABEL: Record<ModelIcon, string> = {
  mosque: "Mosque",
  school: "School",
  park: "Park",
  play: "Playground",
  building: "Building",
  home: "Villas",
  water: "Water / lake",
  road: "Road",
  plane: "Airport",
};
// same drawings as the 3D viewer (webgl/public/viewer/hotspots.js)
const ICON_PATH: Record<ModelIcon, string> = {
  mosque: '<path d="M4 21V11a8 6 0 0 1 16 0v10M2 21h20M12 2v3M9.5 21v-4a2.5 2.5 0 0 1 5 0v4"/>',
  school: '<path d="m3 9 9-5 9 5-9 5Z"/><path d="M7 11v5c3 2 7 2 10 0v-5M21 9v6"/>',
  park: '<path d="M12 22v-6"/><path d="M8 16h8l-2.5-3.5H16L12 6l-4 6.5h2.5Z"/>',
  play: '<circle cx="12" cy="5" r="2"/><path d="M4 21 9 9h6l5 12M7 15h10"/>',
  building: '<path d="M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 8h2M14 8h2M8 12h2M14 12h2"/>',
  water: '<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M12 3s-4 4.5-4 7a4 4 0 0 0 8 0c0-2.5-4-7-4-7Z"/>',
  road: '<path d="M4 21 8 3M20 21 16 3M12 5v2M12 11v2M12 17v2"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z"/>',
};
const Icon = ({ k, size = 16 }: { k: ModelIcon; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: ICON_PATH[k] }} />
);

/** Picture for the info panel: cropped to 800 × 460 WebP (the viewer's size). */
async function panelPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const W = 800;
  const H = 460;
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const sw = W / scale;
  const sh = H / scale;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, W, H);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.85));
  if (!blob) throw new Error("Could not read the picture");
  return blob;
}

type Engine = {
  /** model coordinates of the point under the pointer */
  pickAt: (clientX: number, clientY: number) => [number, number, number] | null;
  /** the current view, in the viewer's "cam" format */
  currentView: () => NonNullable<ModelPin["cam"]>;
  /** move the camera to a pin's view (as the viewer does) */
  showView: (p: ModelPin) => void;
};

/**
 * GLB Studio · the real 3D: the project's model as the 3D viewer shows it. Click to place a pin,
 * then set its icon, text, picture and the view the camera flies to.
 */
export default function RealModelEditor({ complexId, modelUrl, projectName, pins: initial, saving, onSave, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pinEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const engineRef = useRef<Engine | null>(null);
  const [pins, setPins] = useState<ModelPin[]>(initial);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<"new" | string | null>(null);
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const [status, setStatus] = useState("Loading the model… 0%");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const sel = pins.find((p) => p.id === selected) ?? null;

  const edit = (id: string, patch: Partial<ModelPin>) => {
    setPins((all) => all.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setDirty(true);
  };

  const placeRef = useRef<(at: [number, number, number]) => void>(() => {});
  placeRef.current = (at) => {
    const mode = placingRef.current;
    if (!mode) return;
    if (mode === "new") {
      const p: ModelPin = { id: newId(), icon: "building", title: "New place", at, text: [], facts: [] };
      setPins((all) => [...all, p]);
      setSelected(p.id);
    } else {
      edit(mode, { at });
    }
    setDirty(true);
    setPlacing(null);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe8f3);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1, 2, 1.2);
    scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.6));
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;

    // same set-up as the viewer: the model centred on its built area, scaled to a 100-unit radius
    let root: THREE.Object3D | null = null;
    let s = 1;
    let disposed = false;
    let flight: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t0: number } | null = null;

    const draco = new DRACOLoader().setDecoderPath("/draco/");
    const loader = new GLTFLoader().setDRACOLoader(draco);
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        root = gltf.scene;
        root.updateMatrixWorld(true);
        const total = new THREE.Box3().setFromObject(root);
        const totalDiag = total.getSize(new THREE.Vector3()).length();
        const focus = new THREE.Box3();
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.geometry) return;
          m.geometry.computeBoundingBox();
          const bb = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
          if (bb.getSize(new THREE.Vector3()).length() < totalDiag * 0.17) focus.union(bb);
        });
        if (focus.isEmpty()) focus.copy(total);
        const center = focus.getCenter(new THREE.Vector3());
        root.position.sub(center);
        const radius = Math.max(focus.clone().translate(center.clone().negate()).getBoundingSphere(new THREE.Sphere()).radius, 1e-6);
        s = 100 / radius;
        const group = new THREE.Group();
        group.add(root);
        group.scale.setScalar(s);
        scene.add(group);
        group.updateMatrixWorld(true);
        camera.position.set(140, 110, 140);
        controls.target.set(0, 0, 0);
        controls.maxDistance = 900;
        controls.update();
        setStatus("");
      },
      (xhr) => xhr.total && setStatus(`Loading the model… ${Math.round((xhr.loaded / xhr.total) * 100)}%`),
      () => setStatus("Could not load the model."),
    );

    const toWorld = (p: [number, number, number]) => (root ? root.localToWorld(new THREE.Vector3(...p)) : new THREE.Vector3(...p));
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    engineRef.current = {
      pickAt: (x, y) => {
        if (!root) return null;
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(root, true)[0];
        if (!hit) return null;
        const p = root.worldToLocal(hit.point.clone());
        return [Math.round(p.x), Math.round(p.y), Math.round(p.z)];
      },
      currentView: () => {
        const off = camera.position.clone().sub(controls.target);
        const len = off.length();
        const flat = Math.hypot(off.x, off.z) || 1;
        const lt = root ? root.worldToLocal(controls.target.clone()) : controls.target.clone();
        return {
          look: [Math.round(lt.x), Math.round(lt.y / 0.45), Math.round(lt.z)],
          dir: [Number((off.x / flat).toFixed(3)), Number((off.z / flat).toFixed(3))],
          elev: Math.round(THREE.MathUtils.radToDeg(Math.asin(off.y / len))),
          dist: Math.round(len / s),
        };
      },
      showView: (p) => {
        const target = p.cam?.look ? toWorld([p.cam.look[0], p.cam.look[1] * 0.45, p.cam.look[2]]) : toWorld([p.at[0], p.at[1] * 0.45, p.at[2]]);
        let pos: THREE.Vector3;
        if (p.cam) {
          const elev = THREE.MathUtils.degToRad(p.cam.elev);
          const dir = new THREE.Vector3(p.cam.dir[0], 0, p.cam.dir[1]).normalize();
          const d = p.cam.dist * s;
          pos = target.clone().addScaledVector(dir, Math.cos(elev) * d).add(new THREE.Vector3(0, Math.sin(elev) * d, 0));
        } else {
          const off = camera.position.clone().sub(controls.target).setLength((p.view ?? 6000) * s);
          pos = target.clone().add(off);
        }
        flight = { from: camera.position.clone(), to: pos, tFrom: controls.target.clone(), tTo: target, t0: performance.now() };
      },
    };

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let downX = 0;
    let downY = 0;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      flight = null;
    };
    const onUp = (e: PointerEvent) => {
      if (!placingRef.current || Math.hypot(e.clientX - downX, e.clientY - downY) > 5 || e.button !== 0) return;
      const at = engineRef.current?.pickAt(e.clientX, e.clientY);
      if (at) placeRef.current(at);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    let raf = 0;
    const v = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (flight) {
        const k = Math.min(1, (performance.now() - flight.t0) / 1200);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        camera.position.lerpVectors(flight.from, flight.to, e);
        controls.target.lerpVectors(flight.tFrom, flight.tTo, e);
        if (k >= 1) flight = null;
      }
      controls.update();
      renderer.render(scene, camera);
      const w = host.clientWidth;
      const h = host.clientHeight;
      for (const p of pinsRef.current) {
        const el = pinEls.current[p.id];
        if (!el) continue;
        v.copy(toWorld(p.at)).project(camera);
        if (!root || v.z > 1 || v.z < -1) {
          el.style.visibility = "hidden";
          continue;
        }
        el.style.visibility = "visible";
        el.style.transform = `translate3d(${Math.round((v.x * 0.5 + 0.5) * w)}px, ${Math.round((-v.y * 0.5 + 0.5) * h)}px, 0) translate(-50%, -100%)`;
      }
    };
    tick();

    return () => {
      disposed = true;
      engineRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      draco.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
        }
      });
      pmrem.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [modelUrl]);

  const uploadPhoto = async (p: ModelPin, file: File | undefined) => {
    if (!file) return;
    setBusy("photo");
    setNote("");
    try {
      const blob = await panelPhoto(file);
      const res = await fetch("/api/admin/model3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexId, kind: "photo", pinId: p.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not upload the picture");
      const sb = createBrowserSupabase();
      const up = await sb?.storage.from("media").uploadToSignedUrl(j.objectPath, j.token, blob, { contentType: "image/webp", upsert: true });
      if (!up || up.error) throw new Error(up?.error?.message || "Could not upload the picture");
      edit(p.id, { photo: j.publicUrl });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not upload the picture");
    } finally {
      setBusy("");
    }
  };

  const close = () => (!dirty || confirm("Close without saving?")) && onClose();

  return (
    <div className="axa-editor" role="dialog" aria-label="3D model pins">
      <div className="axa-editor-view light">
        <div ref={hostRef} style={{ position: "absolute", inset: 0, cursor: placing ? "crosshair" : "grab" }} />
        {pins.map((p) => (
          <button
            key={p.id}
            ref={(el) => {
              pinEls.current[p.id] = el;
            }}
            type="button"
            className={`axa-mpin${p.id === selected ? " on" : ""}${p.far ? " far" : ""}`}
            style={{ visibility: "hidden" }}
            onClick={() => {
              setSelected(p.id);
              setPlacing(null);
            }}
          >
            <span>
              <Icon k={p.icon} />
              <b dir="auto">{p.title}</b>
            </span>
            <i />
          </button>
        ))}
        <div className="axa-editor-hint">
          {status || (placing ? "Click on the model where the pin goes" : "Drag to turn · right-drag to move · wheel to zoom")}
        </div>
        <button type="button" className={`btn axa-mpin-add${placing === "new" ? " ghost" : ""}`} disabled={!!status} onClick={() => setPlacing(placing === "new" ? null : "new")}>
          {placing === "new" ? "Cancel" : "+ Add pin"}
        </button>
      </div>

      <aside className="axa-editor-side">
        <header>
          <div>
            <small>3D model · pins</small>
            <h2>{projectName}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>×</button>
        </header>

        {sel ? (
          <div className="axa-pin-form">
            <h3>Selected pin</h3>
            <label>
              Icon
              <select value={sel.icon} onChange={(e) => edit(sel.id, { icon: e.target.value as ModelIcon })}>
                {MODEL_ICONS.map((k) => (
                  <option key={k} value={k}>{ICON_LABEL[k]}</option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input dir="auto" value={sel.title} maxLength={80} onChange={(e) => edit(sel.id, { title: e.target.value })} />
            </label>
            <label>
              Text <small className="muted">(a blank line starts a new paragraph)</small>
              <textarea dir="auto" rows={5} value={sel.text.join("\n\n")} onChange={(e) => edit(sel.id, { text: e.target.value.split(/\n\s*\n/) })} />
            </label>
            <label>
              Key points <small className="muted">(one per line)</small>
              <textarea dir="auto" rows={3} value={(sel.facts ?? []).join("\n")} onChange={(e) => edit(sel.id, { facts: e.target.value.split("\n") })} />
            </label>
            <div className="axa-mpin-photo">
              {sel.photo?.startsWith("https://") ? <img src={sel.photo} alt="" /> : <span className="muted">{sel.photo ? "The viewer's own picture" : "No picture"}</span>}
              <label className={`btn ghost small${busy ? " disabled" : ""}`}>
                <input type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={!!busy} onChange={(e) => void uploadPhoto(sel, e.target.files?.[0])} />
                {busy === "photo" ? "Uploading…" : sel.photo ? "Change picture" : "Add picture"}
              </label>
            </div>
            <label className="axa-check">
              <input type="checkbox" checked={!!sel.far} onChange={(e) => edit(sel.id, { far: e.target.checked || undefined, snap: e.target.checked || undefined })} />
              Outside the project (only the info opens, the camera does not fly)
            </label>
            {!sel.far && (
              <div className="axa-mpin-view">
                <b>View when clicked</b>
                <small className="muted">{sel.cam ? "Set — the camera flies to this view." : "Not set — the viewer chooses a view."}</small>
                <div className="axa-link-actions">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      const cam = engineRef.current?.currentView();
                      if (cam) edit(sel.id, { cam });
                      setNote("View saved for this pin. Save to keep it.");
                    }}
                  >
                    Use this view
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => engineRef.current?.showView(sel)}>See the view</button>
                </div>
              </div>
            )}
            <div className="axa-link-actions">
              <button type="button" className="btn ghost small" onClick={() => setPlacing(placing === sel.id ? null : sel.id)}>{placing === sel.id ? "Cancel" : "Move"}</button>
              <button
                type="button"
                className="icon-btn danger"
                aria-label="Delete pin"
                onClick={() => {
                  setPins((all) => all.filter((x) => x.id !== sel.id));
                  setSelected(null);
                  setDirty(true);
                }}
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <p className="muted">Click “+ Add pin”, then click on the model. Or click a pin to edit it.</p>
        )}
        {note && <p className="ok">{note}</p>}

        <h3>Pins ({pins.length})</h3>
        <ul className="axa-links">
          {pins.map((p) => (
            <li key={p.id} className={p.id === selected ? "on" : ""} onClick={() => setSelected(p.id)}>
              <span className="axa-scene-n"><Icon k={p.icon} size={14} /></span>
              <div>
                <b dir="auto">{p.title}</b>
                <small className="muted">{p.far ? "Info only" : p.cam ? "Flies to its view" : "Flies near the place"}</small>
              </div>
            </li>
          ))}
        </ul>

        <footer>
          <button type="button" className="btn ghost" onClick={close}>Close</button>
          <button type="button" className="btn" disabled={saving || !dirty || pins.some((p) => !p.title.trim())} onClick={() => void onSave(pins).then((ok) => ok && setDirty(false))}>
            {saving ? "Saving…" : dirty ? "Save pins" : "Saved"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
