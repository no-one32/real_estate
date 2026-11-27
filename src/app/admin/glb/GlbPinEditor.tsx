"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { newId, type MapPin, type MapPinKind } from "@/lib/hotspots";
import type { TourScene360 } from "@/lib/tour";

type Props = {
  glbUrl: string;
  projectName: string;
  scenes: TourScene360[];
  pins: MapPin[];
  saving: boolean;
  onSave: (pins: MapPin[]) => Promise<boolean>;
  onClose: () => void;
};

/**
 * Admin-only 3D editor: the project's GLB in its own viewer (orbit / zoom / pan),
 * click a surface to drop a pin, choose what the pin does. Nothing here touches the public tour.
 */
export default function GlbPinEditor({ glbUrl, projectName, scenes, pins: initial, saving, onSave, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pinEls = useRef<(HTMLButtonElement | null)[]>([]);
  const [pins, setPins] = useState<MapPin[]>(initial);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const [form, setForm] = useState<MapPin | null>(null);
  const [status, setStatus] = useState("Loading the model…");
  const [dirty, setDirty] = useState(false);
  const addRef = useRef<(pos: [number, number, number]) => void>(() => {});
  addRef.current = (pos) =>
    setForm({ id: newId(), pos, kind: scenes.length ? "scene" : "info", sceneId: scenes[0]?.id, title: "" });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe9eef7);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1, 2, 1.2);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1e7);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;

    const pickables: THREE.Object3D[] = [];
    let ground: THREE.Mesh | null = null;
    let disposed = false;

    new GLTFLoader().load(
      glbUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.visible = true;
          o.material = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
          pickables.push(o);
        });
        scene.add(model);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const span = Math.max(size.x, size.z, 1);
        // ground at the model's lowest point, so streets and open areas can take pins too
        ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 3, span * 3), new THREE.MeshStandardMaterial({ color: 0xd5dde9, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(center.x, box.min.y - 0.01, center.z);
        scene.add(ground);
        pickables.push(ground);
        const grid = new THREE.GridHelper(span * 3, 60, 0xb8c4d6, 0xc9d3e2);
        grid.position.copy(ground.position);
        scene.add(grid);
        camera.near = span / 1000;
        camera.far = span * 20;
        camera.position.set(center.x + span * 0.7, center.y + span * 0.6, center.z + span * 0.7);
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
        setStatus("");
      },
      undefined,
      () => setStatus("Could not load the model."),
    );

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

    // a click (not a drag) drops a pin on what is under the pointer
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5 || e.button !== 0) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables, false)[0];
      if (hit) addRef.current([Math.round(hit.point.x), Math.round(hit.point.y), Math.round(hit.point.z)]);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    let raf = 0;
    const v = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
      const w = host.clientWidth;
      const h = host.clientHeight;
      pinsRef.current.forEach((p, i) => {
        const el = pinEls.current[i];
        if (!el) return;
        v.set(...p.pos).project(camera);
        if (v.z > 1 || v.z < -1) {
          el.style.visibility = "hidden";
          return;
        }
        el.style.visibility = "visible";
        el.style.transform = `translate3d(${Math.round((v.x * 0.5 + 0.5) * w)}px, ${Math.round((-v.y * 0.5 + 0.5) * h)}px, 0) translate(-50%, -100%)`;
      });
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [glbUrl]);

  const label = (p: MapPin) => (p.kind === "scene" ? `360° · ${scenes.find((s) => s.id === p.sceneId)?.label || p.sceneId || "?"}` : p.title || (p.kind === "link" ? "Link" : "Info"));
  const exists = form ? pins.some((x) => x.id === form.id) : false;

  return (
    <div className="axa-editor" role="dialog" aria-label="3D pins">
      <div className="axa-editor-view light">
        <div ref={hostRef} style={{ position: "absolute", inset: 0, cursor: "crosshair" }} />
        {pins.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              pinEls.current[i] = el;
            }}
            type="button"
            className={`axa-pin kind-${p.kind}${form?.id === p.id ? " on" : ""}`}
            style={{ visibility: "hidden" }}
            onClick={() => setForm(p)}
          >
            <span>{label(p)}</span>
            <i />
          </button>
        ))}
        <div className="axa-editor-hint">{status || "Drag to turn · right-drag to move · wheel to zoom · click the model to add a pin"}</div>
      </div>

      <aside className="axa-editor-side">
        <header>
          <div>
            <small>3D pins</small>
            <h2>{projectName}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => (!dirty || confirm("Close without saving?")) && onClose()}>×</button>
        </header>

        {form ? (
          <form
            className="axa-pin-form"
            onSubmit={(e) => {
              e.preventDefault();
              setPins((list) => (list.some((x) => x.id === form.id) ? list.map((x) => (x.id === form.id ? form : x)) : [...list, form]));
              setDirty(true);
              setForm(null);
            }}
          >
            <h3>{exists ? "Edit pin" : "New pin"}</h3>
            <label>
              On click
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as MapPinKind })}>
                <option value="scene" disabled={!scenes.length}>Open a 360° scene</option>
                <option value="info">Show an info card</option>
                <option value="link">Open a link</option>
              </select>
            </label>
            {form.kind === "scene" && (
              <label>
                Scene
                <select value={form.sceneId ?? ""} onChange={(e) => setForm({ ...form, sceneId: e.target.value })}>
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>{s.label || s.id}</option>
                  ))}
                </select>
              </label>
            )}
            {form.kind !== "scene" && (
              <label>
                Title
                <input value={form.title ?? ""} maxLength={40} required onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
            )}
            {form.kind === "info" && (
              <label>
                Text
                <textarea rows={3} maxLength={600} value={form.text ?? ""} onChange={(e) => setForm({ ...form, text: e.target.value })} />
              </label>
            )}
            {form.kind === "link" && (
              <label>
                Link (https://…)
                <input type="url" required value={form.url ?? ""} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              </label>
            )}
            <div className="axa-link-actions">
              {exists && (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    setPins((list) => list.filter((x) => x.id !== form.id));
                    setDirty(true);
                    setForm(null);
                  }}
                >
                  Delete
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn ghost small" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn small">OK</button>
            </div>
          </form>
        ) : (
          <p className="muted">Click on the model to add a pin, or click a pin to edit it.</p>
        )}

        <h3>Pins ({pins.length})</h3>
        <ul className="axa-links">
          {pins.map((p, i) => (
            <li key={p.id} className={form?.id === p.id ? "on" : ""} onClick={() => setForm(p)}>
              <span className="axa-scene-n">{i + 1}</span>
              <div>
                <b>{label(p)}</b>
                <small className="muted">{p.kind === "scene" ? "Opens a 360° scene" : p.kind === "link" ? p.url : "Info card"}</small>
              </div>
            </li>
          ))}
        </ul>

        <footer>
          <button type="button" className="btn ghost" onClick={() => (!dirty || confirm("Close without saving?")) && onClose()}>Close</button>
          <button type="button" className="btn" disabled={saving || !dirty} onClick={() => void onSave(pins).then((ok) => ok && setDirty(false))}>
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
