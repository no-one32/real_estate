"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DESIGN_W, DESIGN_H, setUiScale } from "./ui-scale";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { AxisWatermark, IcAssistant, IcBell, IcCamera, IcChart, IcChevronDown, IcGrid, IcHelp, IcLogout, IcUsers } from "./DashIcons";
import GlobalSearch, { type SearchHit } from "./GlobalSearch";
import "../admin/admin.css";
import "./dashboard.css";

/** "project" = inside one project (its own Apartments / Analytics / Contacts tabs) */
export type ClientView = "projects" | "analytics" | "contacts" | "project" | "help" | "notifications" | "assistant";

type Props = {
  children: React.ReactNode;
  view: ClientView;
  onView: (view: ClientView) => void;
  /** new visitors + new interested people, over all of this user's projects */
  notifications: number;
  name: string;
  avatarUrl: string | null;
  onAvatar: (url: string) => void;
  /** everything "Search anything" can find */
  searchItems: SearchHit[];
  /** an admin is inside this client's portal: show a banner and "back to admin" instead of sign out */
  viewAs?: { adminName: string } | null;
};

/** Square-crop and shrink the picked photo to 256px WebP before upload. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
  if (blob && blob.type === "image/webp") return blob;
  // Safari < 16 cannot encode WebP
  const jpg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!jpg) throw new Error("encode failed");
  return jpg;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function ClientShell({ children, view, onView, notifications, name, avatarUrl, onAvatar, searchItems, viewAs }: Props) {
  const router = useRouter();
  // The dashboard is drawn on the 1920 × 1080 Figma frame and scaled to fit the window (like Figma's preview),
  // so proportions match the design on any computer screen. Phones / small windows keep the normal layout.
  const [scale, setScale] = useState(1);
  const [viewH, setViewH] = useState(1080);
  /** phone: the menu becomes a bar at the top instead of the left sidebar (tablet and PC keep the sidebar) */
  const [topBar, setTopBar] = useState(false);
  useLayoutEffect(() => {
    const fit = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // browsers without CSS zoom (Firefox before v126) keep the normal, unscaled layout
      const canZoom = typeof CSS !== "undefined" && CSS.supports?.("zoom", "0.5");
      const s = !canZoom || w < 1024 ? 1 : Math.min(1, w / DESIGN_W, h / DESIGN_H);
      setUiScale(s);
      setScale(s);
      setViewH(h);
      // phones only (portrait, or landscape: a touch screen whose short side is phone-sized); tablets and PC keep the sidebar
      const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      setTopBar(w <= 760 || (touch && Math.min(w, h) <= 500));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  const leavePortal = async () => {
    await fetch("/api/admin/view-as", { method: "DELETE" }).catch(() => {});
    router.replace("/admin");
    router.refresh();
  };

  const signOut = async () => {
    if (viewAs) return leavePortal(); // never sign the admin out from a client's portal
    const sb = createBrowserSupabase();
    await sb?.auth.signOut();
    router.replace("/client/login");
    router.refresh();
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoErr("");
    setUploading(true);
    try {
      const blob = await shrinkPhoto(file);
      const form = new FormData();
      form.append("file", blob, blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg");
      const res = await fetch("/api/client/avatar", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "تعذر رفع الصورة");
      onAvatar(json.avatarUrl);
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const nav: [ClientView, string, React.ReactNode][] = [
    ["projects", "المشاريع", <IcGrid key="g" size={24} />],
    ["analytics", "الإحصائيات", <IcChart key="c" size={24} />],
    ["contacts", "العملاء", <IcUsers key="u" size={26} />],
  ];

  return (
    <div dir="rtl" lang="ar" className={`axd axd-view-${view}${topBar ? " axd-top" : ""}`} style={{ zoom: scale, ["--axd-h" as string]: `${viewH / scale}px` }}>
      <AxisWatermark className="axd-watermark" />

      <aside className="axd-side">
        <div className="axd-logo">
          <img src="/branding/designscape-vertical.png" alt="Designscape" width={85} height={146} />
        </div>

        <nav className="axd-nav" aria-label="القائمة الرئيسية">
          {nav.map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              className={`axd-nav-item${view === key || (key === "projects" && view === "project") ? " on" : ""}`}
              aria-current={view === key || (key === "projects" && view === "project") ? "page" : undefined}
              onClick={() => onView(key)}
            >
              {icon}
              <span className="axd-label">{label}</span>
            </button>
          ))}
          <button
            type="button"
            className={`axd-nav-item${view === "assistant" ? " on" : ""}`}
            aria-current={view === "assistant" ? "page" : undefined}
            onClick={() => onView("assistant")}
          >
            <IcAssistant size={24} />
            <span className="axd-label">المساعد</span>
          </button>
        </nav>
        <div className="axd-divider" />

        <div className="axd-side-bottom">
          <button
            type="button"
            className={`axd-nav-item axd-small${view === "notifications" ? " on" : ""}`}
            aria-current={view === "notifications" ? "page" : undefined}
            onClick={() => onView("notifications")}
          >
            <span className="axd-bell">
              <IcBell size={22} />
              {notifications > 0 ? <span className="axd-dot">{notifications > 99 ? "99+" : notifications}</span> : null}
            </span>
            <span className="axd-label">الإشعارات</span>
          </button>
          <button
            type="button"
            className={`axd-nav-item axd-small${view === "help" ? " on" : ""}`}
            aria-current={view === "help" ? "page" : undefined}
            onClick={() => onView("help")}
          >
            <IcHelp size={22} />
            <span className="axd-label">المساعدة</span>
          </button>

          <div className="axd-account" ref={accountRef}>
            <button
              type="button"
              className={`axd-avatar${uploading ? " busy" : ""}`}
              title="تغيير صورة الملف الشخصي"
              aria-label="تغيير صورة الملف الشخصي"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials(name)}</span>}
              <span className="axd-avatar-cam"><IcCamera size={16} /></span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => void pickPhoto(e.target.files?.[0])}
            />
            <button
              type="button"
              className="axd-account-toggle"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="axd-account-text">
                <span className="axd-account-name">{name || "حسابي"}</span>
                <span className="axd-account-role">مستخدم الاستوديو</span>
              </span>
              <span className={`axd-chev${menuOpen ? " up" : ""}`}><IcChevronDown size={15} /></span>
            </button>
            {menuOpen ? (
              <div className="axd-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void signOut()}>
                  <IcLogout size={18} />
                  {viewAs ? "العودة إلى لوحة الإدارة" : "تسجيل الخروج"}
                </button>
              </div>
            ) : null}
            {photoErr ? <p className="axd-photo-err" role="alert">{photoErr}</p> : null}
          </div>
        </div>
      </aside>

      <div className="axd-work">
        {viewAs ? (
          <div className="axd-viewas" dir="ltr" role="status">
            <span>
              Admin view · you are inside <b>{name || "this client"}</b>’s portal. Changes you make here are saved for this client.
            </span>
            <button type="button" onClick={() => void leavePortal()}>Back to admin</button>
          </div>
        ) : null}
        <GlobalSearch items={searchItems} />
        {children}
      </div>
    </div>
  );
}
