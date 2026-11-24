"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Video shown after "اكتشف المزيد", before the maquette.
 * - It starts buffering while the maquette loads (its first seconds count in the loading %),
 *   the rest streams while it plays.
 * - Quality follows the connection: 1080p good, 720p medium, 480p weak; it steps down if it keeps stalling.
 * - The visitor reaches the maquette only when the video ends or when they press skip.
 */

const BASE = "/complexes/villas-ajyad/discover/video-";
const QUALITIES = [480, 720, 1080] as const;
type Q = (typeof QUALITIES)[number];
const src = (q: Q) => `${BASE}${q}.mp4`;

/** Seconds that must be buffered before the "discover" button shows. */
const HEAD_SECONDS = 10;

type NetInfo = { saveData?: boolean; effectiveType?: string; downlink?: number };

function fromMbps(mbps: number, phone: boolean): Q {
  const q: Q = mbps >= 5 ? 1080 : mbps >= 2 ? 720 : 480;
  return phone && q === 1080 ? 720 : q; // a phone screen gains nothing from 1080p
}

async function pickQuality(): Promise<Q> {
  const phone = window.matchMedia?.("(max-width: 900px), (pointer: coarse)").matches ?? false;
  const c = (navigator as Navigator & { connection?: NetInfo }).connection;
  if (c?.saveData) return 480;
  if (c?.effectiveType && c.effectiveType !== "4g") return 480;
  if (c && typeof c.downlink === "number" && c.downlink > 0) return fromMbps(c.downlink, phone);
  // no connection info (Safari, Firefox): time a small piece of the medium file
  try {
    const t0 = performance.now();
    const res = await fetch(src(720), { headers: { Range: "bytes=0-299999" }, cache: "no-store" });
    const bytes = (await res.arrayBuffer()).byteLength;
    const sec = Math.max(0.05, (performance.now() - t0) / 1000);
    return fromMbps((bytes * 8) / 1e6 / sec, phone);
  } catch {
    return 720;
  }
}

export type DiscoverVideoHandle = { play: () => void };

type Props = {
  /** 0–100: how much of the video's first seconds is buffered (or 100 if it can't load). */
  onProgress: (pct: number) => void;
  playing: boolean;
  onDone: () => void;
};

const DiscoverVideo = forwardRef<DiscoverVideoHandle, Props>(function DiscoverVideo({ onProgress, playing, onDone }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [quality, setQuality] = useState<Q | null>(null);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const resumeAt = useRef(0);
  const stalls = useRef(0);
  const doneRef = useRef(false);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    videoRef.current?.pause();
    onDone();
  };

  useEffect(() => {
    let alive = true;
    void pickQuality().then((q) => alive && setQuality(q));
    return () => {
      alive = false;
    };
  }, []);

  // buffering progress of the first seconds (before the visitor clicks)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !quality) return;
    const report = () => {
      if (v.readyState >= 4) return progressRef.current(100);
      const head = Math.min(HEAD_SECONDS, v.duration || HEAD_SECONDS);
      const end = v.buffered.length ? v.buffered.end(0) : 0;
      progressRef.current(Math.min(100, (end / head) * 100));
    };
    const fail = () => progressRef.current(100); // never block the maquette on the video
    const evs = ["progress", "loadeddata", "canplay", "canplaythrough"] as const;
    evs.forEach((e) => v.addEventListener(e, report));
    v.addEventListener("error", fail);
    const tick = window.setInterval(report, 500);
    return () => {
      evs.forEach((e) => v.removeEventListener(e, report));
      v.removeEventListener("error", fail);
      window.clearInterval(tick);
    };
  }, [quality]);

  // while playing: keep stepping down a quality when it keeps stalling
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;
    let stallTimer = 0;
    const onWaiting = () => {
      setWaiting(true);
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        stalls.current++;
        const i = quality ? QUALITIES.indexOf(quality) : 0;
        if (stalls.current >= 2 && i > 0) {
          stalls.current = 0;
          resumeAt.current = v.currentTime;
          setQuality(QUALITIES[i - 1]);
        }
      }, 2500);
    };
    const onPlaying = () => {
      setWaiting(false);
      window.clearTimeout(stallTimer);
    };
    const onTime = () => setTime(v.duration ? v.currentTime / v.duration : 0);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", finish);
    v.addEventListener("error", finish);
    return () => {
      window.clearTimeout(stallTimer);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", finish);
      v.removeEventListener("error", finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, quality]);

  // after a quality switch, continue from the same moment
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing || !resumeAt.current) return;
    const at = resumeAt.current;
    const go = () => {
      v.currentTime = at;
      resumeAt.current = 0;
      void v.play().catch(() => {});
    };
    if (v.readyState >= 1) go();
    else v.addEventListener("loadedmetadata", go, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);

  useImperativeHandle(ref, () => ({
    // called straight from the click, so the browser lets the sound play
    play: () => {
      const v = videoRef.current;
      if (!v || v.error || !quality) return finish();
      v.currentTime = 0;
      v.muted = false;
      setMuted(false);
      v.play().catch(() => {
        v.muted = true;
        setMuted(true);
        v.play().catch(finish);
      });
    },
  }));

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <div className={`discover${playing ? " on" : ""}`} aria-hidden={!playing}>
      {/* muted stays true in the markup (so it may buffer quietly); the sound is switched on in play() */}
      <video ref={videoRef} className="discover-video" src={quality ? src(quality) : undefined} preload="auto" playsInline muted />
      {playing && (
        <>
          {waiting && <span className="discover-spin" role="status" aria-label="جارٍ التحميل" />}
          <button type="button" className="discover-skip" onClick={finish}>
            تخطي
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5l9 7-9 7zM16 5h2v14h-2z" transform="scale(-1 1) translate(-24 0)" /></svg>
          </button>
          <button type="button" className="discover-sound" onClick={toggleSound} aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}>
            {muted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13" /></svg>
            )}
          </button>
          <span className="discover-bar" style={{ transform: `scaleX(${time})` }} />
        </>
      )}
    </div>
  );
});

export default DiscoverVideo;
