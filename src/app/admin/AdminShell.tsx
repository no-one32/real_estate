"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Ai360, AiBell, AiChart, AiChevron, AiCube, AiGear, AiHelp, AiHome, AiLogout, AiPortals, AiSearch, AiUsers } from "./AdminIcons";
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
};

export function initialsOf(name: string) {
  return (name || "A").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function Avatar({ me, size = "" }: { me: AdminMe; size?: "" | "sm" | "lg" }) {
  return <span className={`axa-avatar ${size}`}>{me.avatarUrl ? <img src={me.avatarUrl} alt="" /> : initialsOf(me.name)}</span>;
}

export default function AdminShell({ children, search, onSearch, searchPlaceholder, me: meProp }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [meLoaded, setMe] = useState<AdminMe>({ name: "", email: "", avatarUrl: null });
  const me = meProp ?? meLoaded;
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
            <Avatar me={me} />
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
        <header className="axa-top">
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
            <Link href="/admin/settings" className="axa-me">
              <Avatar me={me} size="sm" />
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
