"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Ai360, AiBell, AiCamera, AiChart, AiChevron, AiCube, AiGear, AiHelp, AiHome, AiLogout, AiPortals, AiSearch, AiUsers } from "./AdminIcons";
import "./admin.css";
import "./admin-v2.css";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: <AiHome />, match: (p: string) => p.startsWith("/admin/dashboard") },
  { href: "/admin", label: "Portals", icon: <AiPortals />, match: (p: string) => p === "/admin" || p.startsWith("/admin/complexes") },
  { href: "/admin/clients", label: "Clients", icon: <AiUsers />, match: (p: string) => p.startsWith("/admin/clients") },
  { href: "/admin/tours", label: "360 Tours", icon: <Ai360 />, match: (p: string) => p.startsWith("/admin/tours") },
  { href: "/admin/glb", label: "GLB Studio", icon: <AiCube />, match: (p: string) => p.startsWith("/admin/glb") },
  { href: "/admin/analytics", label: "Analytics", icon: <AiChart />, match: (p: string) => p.startsWith("/admin/analytics") },
  { href: "/admin/settings", label: "Settings", icon: <AiGear />, match: (p: string) => p.startsWith("/admin/settings") },
];

/** when the admin last opened Notifications (the badge counts buyers that came after) */
export const NOTIF_SEEN_KEY = "axa-notifications-seen";

export type AdminMe = { name: string; email: string; avatarUrl: string | null };

type Props = {
  children: React.ReactNode;
  /** text typed in the top search bar; pages that support search pass these */
  search?: string;
  onSearch?: (q: string) => void;
  searchPlaceholder?: string;
  /** Settings passes this so a new name / photo shows at once in the sidebar */
  me?: AdminMe | null;
  /** called after the photo was changed from the sidebar / top bar */
  onPhoto?: (url: string) => void;
};

export function initialsOf(name: string) {
  return (name || "A").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/** Square-crop and shrink the photo to 256px before upload (same as the client dashboard). */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close();
  const webp = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
  if (webp && webp.type === "image/webp") return webp;
  const jpg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!jpg) throw new Error("encode failed");
  return jpg;
}

/** Sends the photo; returns its URL. */
export async function uploadAdminPhoto(file: File): Promise<string> {
  const blob = await shrinkPhoto(file);
  const form = new FormData();
  form.append("file", blob, blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg");
  const res = await fetch("/api/admin/avatar", { method: "POST", body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Could not upload the photo");
  return j.avatarUrl as string;
}

export function Avatar({ me, size = "" }: { me: AdminMe; size?: "" | "sm" | "lg" }) {
  return <span className={`axa-avatar ${size}`}>{me.avatarUrl ? <img src={me.avatarUrl} alt="" /> : initialsOf(me.name)}</span>;
}

export default function AdminShell({ children, search, onSearch, searchPlaceholder, me: meProp, onPhoto }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [meLoaded, setMe] = useState<AdminMe>({ name: "", email: "", avatarUrl: null });
  const [photo, setPhoto] = useState<string | null>(null);
  const base = meProp ?? meLoaded;
  const me = photo ? { ...base, avatarUrl: photo } : base;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAdminPhoto(file);
      setPhoto(url);
      onPhoto?.(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not upload the photo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const photoButton = (size: "" | "sm") => (
    <button
      type="button"
      className={`axa-photo-pick${uploading ? " busy" : ""}`}
      title="Change your photo"
      aria-label="Change your photo"
      disabled={uploading}
      onClick={() => fileRef.current?.click()}
    >
      <Avatar me={me} size={size} />
      <span className="axa-photo-cam"><AiCamera size={size === "sm" ? 14 : 16} /></span>
    </button>
  );
  const [unseen, setUnseen] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/admin/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setMe({ name: j.name, email: j.email, avatarUrl: j.avatarUrl }));
  }, []);

  useEffect(() => {
    if (path.startsWith("/admin/notifications")) return setUnseen(0);
    const since = localStorage.getItem(NOTIF_SEEN_KEY);
    void fetch(`/api/admin/notifications${since ? `?since=${encodeURIComponent(since)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setUnseen(j.unseen ?? 0));
  }, [path]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const signOut = async () => {
    await fetch("/api/admin/view-as", { method: "DELETE" }).catch(() => {});
    const sb = createBrowserSupabase();
    await sb?.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  const smallItem = (href: string, label: string, icon: React.ReactNode, badge = 0) => {
    const on = path.startsWith(href);
    return (
      <Link href={href} className={`axa-nav-item small${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
        <span className="axa-bell">
          {icon}
          {badge > 0 && <span className="axa-badge">{badge > 99 ? "99+" : badge}</span>}
        </span>
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="axa">
      <div className="axa-watermark" aria-hidden="true" />
      <aside className="axa-side">
        <Link href="/admin/dashboard" className="axa-logo" aria-label="Dashboard">
          <img src="/branding/designscape-vertical.png" alt="Designscape" width={85} height={146} />
        </Link>
        <nav className="axa-nav" aria-label="Admin">
          {NAV.map((n) => {
            const on = n.match(path);
            return (
              <Link key={n.href} href={n.href} className={`axa-nav-item${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
                {n.icon}
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="axa-side-bottom">
          {smallItem("/admin/notifications", "Notifications", <AiBell size={21} />, unseen)}
          {smallItem("/admin/help", "Help", <AiHelp size={21} />)}
          <div className="axa-account" ref={accountRef}>
            {photoButton("")}
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            <button type="button" className="axa-account-toggle" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              <span className="axa-account-text">
                <b>{me.name || "Admin"}</b>
                <small>Administrator</small>
              </span>
              <span className={`axa-chev${menuOpen ? " up" : ""}`}><AiChevron size={16} /></span>
            </button>
            {menuOpen && (
              <div className="axa-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void signOut()}>
                  <AiLogout size={18} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="axa-work">
        <header className={`axa-top${onSearch ? "" : " bare"}`}>
          {onSearch ? (
            <label className="axa-search">
              <AiSearch size={18} />
              <input type="search" value={search ?? ""} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder || "Search…"} />
            </label>
          ) : (
            <span />
          )}
          <div className="axa-top-right">
            <Link href="/admin/notifications" className="axa-top-bell" aria-label="Notifications">
              <AiBell size={21} />
              {unseen > 0 && <i />}
            </Link>
            {photoButton("sm")}
            <Link href="/admin/settings" className="axa-me">
              <span>
                <b>{me.name || "Admin"}</b>
                <small>Administrator</small>
              </span>
            </Link>
          </div>
        </header>
        <main className="portal-main axa-main">{children}</main>
      </div>
    </div>
  );
}
