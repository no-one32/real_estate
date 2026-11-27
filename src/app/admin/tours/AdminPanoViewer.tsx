"use client";

// Admin-only copy of the 360 viewer (with buttons + click-to-place). The public tour keeps its own PanoramaViewer untouched.

import { useEffect, useRef } from "react";
import * as THREE from "three";

/** A button drawn inside the panorama at a look direction (degrees, same angles as the viewer). */
export type PanoLink = { id: string; lon: number; lat: number; label?: string; thumb?: string; active?: boolean };

type Props = {
  src: string;
  className?: string;
  links?: PanoLink[];
  /** a button was clicked; the viewer first turns and moves toward it, then calls this */
  onLink?: (id: string) => void;
  /** edit mode: a click (not a drag) on the picture gives the direction that was clicked; buttons don't animate */
  onPick?: (lon: number, lat: number) => void;
  /**
   * Panoramas the buttons of this scene lead to: downloaded one by one once this scene is shown,
   * so a click moves on at once. Empty / omitted = nothing extra is downloaded.
   */
  preload?: string[];
};

const FOV = 75;
/** how far the camera "walks in" (narrower field of view) before the next scene appears */
const FOV_WALK = 42;
const TURN_MS = 420;
const FADE_MS = 650;

const dirOf = (lon: number, lat: number, out = new THREE.Vector3()) => {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return out.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
};
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** shortest signed angle from a to b, in degrees */
const angleTo = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

type Api = {
  walkTo: (lon: number, lat: number, done: () => void) => void;
  show: (src: string) => void;
  preload: (urls: string[]) => void;
};

type NetInfo = { saveData?: boolean; effectiveType?: string };
/** no preloading on "save data" or 2G/3G-class connections */
function canPreload() {
  const c = (navigator as Navigator & { connection?: NetInfo }).connection;
  if (!c) return true;
  if (c.saveData) return false;
  return !c.effectiveType || c.effectiveType === "4g";
}

/**
 * Equirectangular 360 — hold and drag to look around.
 * The viewer stays mounted between scenes: a new `src` cross-fades in while the camera eases back out,
 * and a clicked button first turns the camera toward it and moves in — like walking to the next spot.
 */
export default function AdminPanoViewer({ src, className, links, onLink, onPick, preload }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const linkEls = useRef<(HTMLButtonElement | null)[]>([]);
  const linksRef = useRef(links);
  linksRef.current = links;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const apiRef = useRef<Api | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
    camera.position.set(0, 0, 0.01);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    canvas.style.pointerEvents = "auto";
    host.appendChild(canvas);

    // current scene on the outer sphere; the next one fades in on a slightly smaller sphere in front of it
    const geo = new THREE.SphereGeometry(500, 64, 40);
    geo.scale(-1, 1, 1);
    const geoNext = new THREE.SphereGeometry(480, 64, 40);
    geoNext.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a2230 });
    const matNext = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    const meshNext = new THREE.Mesh(geoNext, matNext);
    meshNext.renderOrder = 1;
    meshNext.visible = false;
    scene.add(mesh, meshNext);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let disposed = false;
    let loadToken = 0;
    let shownSrc = "";
    /** true once the shown scene's picture is on screen (preloading waits for it) */
    let shownReady = false;

    // Pictures downloaded ahead of a click (decoded images; a texture is made from them when shown).
    const cache = new Map<string, Promise<HTMLImageElement | null>>();
    let wanted: string[] = [];
    let preloading = false;
    const fetchImage = (url: string) => {
      let p = cache.get(url);
      if (!p) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.src = url;
        p = img.decode().then(
          () => img,
          () => null,
        );
        cache.set(url, p);
      }
      return p;
    };
    const runPreload = async () => {
      if (preloading || !shownReady || disposed) return;
      preloading = true;
      // forget pictures no button of this scene leads to any more
      for (const url of [...cache.keys()]) if (!wanted.includes(url)) cache.delete(url);
      for (const url of wanted) {
        if (disposed || !shownReady) break;
        if (url === shownSrc) continue;
        await fetchImage(url); // one at a time, so the shown scene keeps the bandwidth
      }
      preloading = false;
    };

    const prepare = (tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      // Mipmaps reduce shimmering/pixelation when the sphere is large on screen.
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    };

    // Start facing the equirect center (u=0.5), not the left/right wrap seam (u=0).
    // With SphereGeometry + scale(-1,1,1), lon=0 looks at the seam; lon=180 faces the middle.
    let lon = 180;
    let lat = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;

    /** running camera move: from → to over [t0, t0 + ms] */
    type Move = { t0: number; ms: number; lon0: number; lat0: number; dLon: number; dLat: number; fov0: number; fov1: number; done?: () => void };
    let move: Move | null = null;
    /** running cross-fade of the next texture */
    let fade: { t0: number; tex: THREE.Texture } | null = null;
    /** true from a button click until the next scene has fully faded in (buttons hidden meanwhile) */
    let busy = false;
    /** the next picture was reached by clicking a hotspot (only then it cross-fades) */
    let walking = false;

    const startMove = (lon1: number, lat1: number, fov1: number, ms: number, done?: () => void) => {
      move = { t0: performance.now(), ms, lon0: lon, lat0: lat, dLon: angleTo(lon, lon1), dLat: lat1 - lat, fov0: camera.fov, fov1, done };
    };

    const finishFade = () => {
      if (!fade) return;
      const old = mat.map;
      mat.map = fade.tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
      old?.dispose();
      matNext.map = null;
      matNext.opacity = 0;
      meshNext.visible = false;
      fade = null;
      busy = false;
    };

    const show = (next: string) => {
      if (!next || next === shownSrc) return;
      shownSrc = next;
      shownReady = false;
      const token = ++loadToken;
      if (!walking) {
        // Same as before the hotspots (the viewer used to be rebuilt for each scene):
        // dark placeholder while the new picture loads, view back to the middle of the image.
        finishFade();
        mat.map?.dispose();
        mat.map = null;
        mat.color.set(0x1a2230);
        mat.needsUpdate = true;
        lon = 180;
        lat = 0;
        camera.fov = FOV;
        camera.updateProjectionMatrix();
        move = null;
      }
      const onTex = (tex: THREE.Texture) => {
          if (disposed || token !== loadToken) {
            tex.dispose();
            return;
          }
          prepare(tex);
          finishFade(); // a fade still running: jump to its end first
          if (!walking || !mat.map || reduced) {
            // Not reached through a hotspot (first picture, strip thumbnail…): exactly the old behaviour —
            // the picture just switches and the view starts again facing the middle of the image.
            mat.map?.dispose();
            mat.map = tex;
            mat.color.set(0xffffff);
            mat.needsUpdate = true;
            lon = 180;
            lat = 0;
            camera.fov = FOV;
            camera.updateProjectionMatrix();
            move = null;
            busy = false;
            return;
          }
          walking = false;
          matNext.map = tex;
          matNext.opacity = 0;
          matNext.needsUpdate = true;
          meshNext.visible = true;
          fade = { t0: performance.now(), tex };
          // arrive: ease the "walk" zoom back out while the new place fades in
          startMove(lon, lat, FOV, FADE_MS);
      };
      const onFail = () => {
        if (disposed || token !== loadToken) return;
        busy = false; // keep the previous picture
        walking = false;
        startMove(lon, lat, FOV, 300);
      };
      const done = (tex: THREE.Texture) => {
        onTex(tex);
        if (disposed || token !== loadToken) return;
        shownReady = true;
        void runPreload();
      };
      const cached = cache.get(next);
      if (cached) {
        // downloaded ahead: no wait
        void cached.then((img) => {
          if (!img) return onFail();
          const tex = new THREE.Texture(img);
          tex.needsUpdate = true;
          done(tex);
        });
        return;
      }
      loader.load(next, done, undefined, onFail);
    };

    apiRef.current = {
      show,
      preload: (urls) => {
        wanted = canPreload() ? urls.filter(Boolean).slice(0, 6) : [];
        void runPreload();
      },
      walkTo: (lon1, lat1, done) => {
        if (reduced) return done();
        busy = true;
        walking = true;
        const token = loadToken;
        startMove(lon1, Math.max(-30, Math.min(30, lat1)), FOV_WALK, TURN_MS, () => {
          done();
          // no new scene came (same picture, or the target is missing): step back out instead of staying zoomed
          window.setTimeout(() => {
            if (disposed || loadToken !== token) return;
            busy = false;
            walking = false;
            startMove(lon, lat, FOV, 300);
          }, 150);
        });
      },
    };

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      move = null;
      dragging = true;
      lastX = downX = e.clientX;
      lastY = downY = e.clientY;
      canvas.style.cursor = "grabbing";
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dx === 0 && dy === 0) return;
      const k = 0.2 * (camera.fov / FOV);
      lon -= dx * k;
      lat = Math.max(-85, Math.min(85, lat + dy * k));
    };
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const pick = pickRef.current;
      if (pick && e.type === "pointerup" && Math.hypot(e.clientX - downX, e.clientY - downY) < 5) {
        const r = canvas.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const d = ray.ray.direction;
        const pLat = 90 - THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, d.y))));
        const pLon = THREE.MathUtils.radToDeg(Math.atan2(d.z, d.x));
        pick(Math.round(pLon * 100) / 100, Math.round(pLat * 100) / 100);
      }
      canvas.style.cursor = "grab";
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("lostpointercapture", onUp);

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let raf = 0;
    const look = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const v = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      if (move) {
        const t = Math.min(1, (now - move.t0) / move.ms);
        const k = ease(t);
        lon = move.lon0 + move.dLon * k;
        lat = move.lat0 + move.dLat * k;
        camera.fov = move.fov0 + (move.fov1 - move.fov0) * k;
        camera.updateProjectionMatrix();
        if (t >= 1) {
          const done = move.done;
          move = null;
          done?.();
        }
      }
      if (fade) {
        const t = Math.min(1, (now - fade.t0) / FADE_MS);
        matNext.opacity = ease(t);
        if (t >= 1) finishFade();
      }
      dirOf(lon, lat, look);
      camera.lookAt(look.x * 500, look.y * 500, look.z * 500);
      renderer.render(scene, camera);

      // buttons follow the picture (hidden while moving to the next scene)
      const list = linksRef.current;
      if (!list?.length) return;
      camera.getWorldDirection(fwd);
      const w = host.clientWidth;
      const h = host.clientHeight;
      list.forEach((l, i) => {
        const el = linkEls.current[i];
        if (!el) return;
        dirOf(l.lon, l.lat, v);
        if (busy || v.dot(fwd) <= 0.05) {
          el.style.visibility = "hidden";
          return;
        }
        v.multiplyScalar(400).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        if (x < -60 || x > w + 60 || y < -60 || y > h + 60) {
          el.style.visibility = "hidden";
          return;
        }
        el.style.visibility = "visible";
        el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
      });
    };
    tick();

    return () => {
      disposed = true;
      apiRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      dragging = false;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("lostpointercapture", onUp);
      mat.map?.dispose();
      matNext.map?.dispose();
      fade?.tex.dispose();
      cache.clear();
      mat.dispose();
      matNext.dispose();
      geo.dispose();
      geoNext.dispose();
      renderer.dispose();
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, []);

  // a new scene: load it and cross-fade (the first one just appears)
  useEffect(() => {
    apiRef.current?.show(src);
  }, [src]);

  const preloadKey = (preload ?? []).join("|");
  useEffect(() => {
    apiRef.current?.preload(preloadKey ? preloadKey.split("|") : []);
  }, [preloadKey]);

  const clickLink = (l: PanoLink) => {
    const api = apiRef.current;
    // in the admin editor a click only selects the button
    if (!api || pickRef.current) return onLink?.(l.id);
    api.walkTo(l.lon, l.lat, () => onLink?.(l.id));
  };

  return (
    // Same inline style as before the hotspots; the page's class (e.g. .scene360-pano) still places it.
    // Without a class it needs its own positioning so the buttons can sit on top.
    <div className={className} style={{ ...(className ? {} : { position: "relative" as const }), width: "100%", height: "100%", touchAction: "none" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0, cursor: onPick ? "crosshair" : undefined }} />
      {links?.map((l, i) => (
        <button
          key={l.id}
          ref={(el) => {
            linkEls.current[i] = el;
          }}
          type="button"
          className={`pano-link${l.active ? " on" : ""}`}
          style={{ visibility: "hidden" }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            clickLink(l);
          }}
          aria-label={l.label || "Go"}
        >
          <span className="pano-link-ring" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
          </span>
          {l.label ? <span className="pano-link-label">{l.label}</span> : null}
        </button>
      ))}
    </div>
  );
}
