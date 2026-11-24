"use client";

import { useEffect } from "react";
import { IconClose } from "@/components/Icons";

/** YouTube video of the project (button under the gallery in the side rail). */
const YOUTUBE_ID = "xeLZAC8ffPw";

/** Small window over the maquette with the project's YouTube video. Esc, the ✕ or a click outside closes it. */
export default function VideoWindow({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return (
    <div className="vidwin-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vidwin" role="dialog" aria-modal="true" aria-label="فيديو المشروع" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="vidwin-close" onClick={onClose} aria-label="إغلاق">
          <IconClose size={18} />
        </button>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&playsinline=1`}
          title="فيديو المشروع"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    </div>
  );
}
