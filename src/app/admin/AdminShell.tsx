"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Ai360, AiChevron, AiCube, AiLogout, AiPortals, AiSearch, AiUsers } from "./AdminIcons";
import "./admin.css";
import "./admin-v2.css";

const NAV = [
  { href: "/admin", label: "Portals", icon: <AiPortals />, match: (p: string) => p === "/admin" || p.startsWith("/admin/complexes") },
  { href: "/admin/clients", label: "Clients", icon: <AiUsers />, match: (p: string) => p.startsWith("/admin/clients") },
  { href: "/admin/tours", label: "360 Tours", icon: <Ai360 />, match: (p: string) => p.startsWith("/admin/tours") },
  { href: "/admin/glb", label: "GLB Studio", icon: <AiCube />, match: (p: string) => p.startsWith("/admin/glb") },
];

type Props = {
  children: React.ReactNode;
  /** text typed in the top search bar; pages that support search pass these */
  search?: string;
  onSearch?: (q: string) => void;
  searchPlaceholder?: string;
};

export default function AdminShell({ children, search, onSearch, searchPlaceholder }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<{ name: string; email: string }>({ name: "", email: "" });
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sb = createBrowserSupabase();
    void sb?.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      if (!u) return;
      const { data: prof } = await sb.from("profiles").select("full_name").eq("id", u.id).maybeSingle();
      setMe({ name: (prof?.full_name as string | null) || u.email?.split("@")[0] || "Admin", email: u.email || "" });
    });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const signOut = async () => {
    const sb = createBrowserSupabase();
    await sb?.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  const initials = (me.name || "A").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="axa">
      <div className="axa-watermark" aria-hidden="true" />
      <aside className="axa-side">
        <Link href="/admin" className="axa-logo" aria-label="Portals">
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
          <div className="axa-account" ref={accountRef}>
            <span className="axa-avatar">{initials}</span>
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
          <div className="axa-me">
            <span className="axa-avatar sm">{initials}</span>
            <span>
              <b>{me.name || "Admin"}</b>
              <small>Administrator</small>
            </span>
          </div>
        </header>
        <main className="portal-main axa-main">{children}</main>
      </div>
    </div>
  );
}
