"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { Avatar, uploadAdminPhoto, type AdminMe } from "../AdminShell";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import PasswordField from "@/components/PasswordField";
import { AiCamera, AiLogout } from "../AdminIcons";

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch("/api/admin/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setMe({ name: j.name, email: j.email, avatarUrl: j.avatarUrl });
        setName(j.name);
      });
  }, []);

  const flash = (ok: string, bad = "") => {
    setMsg(ok);
    setErr(bad);
  };

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("name");
    const res = await fetch("/api/admin/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: name }) });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return flash("", j.error || "Could not save");
    setMe((m) => (m ? { ...m, name: j.name } : m));
    flash("Name saved.");
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy("photo");
    try {
      const avatarUrl = await uploadAdminPhoto(file);
      setMe((m) => (m ? { ...m, avatarUrl } : m));
      flash("Photo updated.");
    } catch (e) {
      flash("", e instanceof Error ? e.message : "Could not upload the photo");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return flash("", "The password needs at least 8 characters.");
    if (pw !== pw2) return flash("", "The two passwords are different.");
    setBusy("pw");
    const { error } = (await createBrowserSupabase()?.auth.updateUser({ password: pw })) ?? { error: { message: "Sign-in is not available" } };
    setBusy("");
    if (error) return flash("", error.message);
    setPw("");
    setPw2("");
    flash("Password changed. Use it the next time you sign in.");
  };

  const signOut = async () => {
    await createBrowserSupabase()?.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <AdminShell me={me} onPhoto={(avatarUrl) => setMe((m) => (m ? { ...m, avatarUrl } : m))}>
      <header className="axa-head">
        <div>
          <h1>Settings</h1>
          <p>Your admin profile and password.</p>
        </div>
      </header>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      <div className="axa-grid-2">
        <section className="axa-panel">
          <header className="axa-panel-title"><h2>Profile</h2></header>
          <div className="axa-profile">
            <button type="button" className="axa-photo" onClick={() => fileRef.current?.click()} disabled={busy === "photo"} aria-label="Change photo">
              {me && <Avatar me={me} size="lg" />}
              <span><AiCamera size={18} /></span>
            </button>
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            <div>
              <b>{me?.name || "…"}</b>
              <small>{me?.email}</small>
              <button type="button" className="btn ghost small axa-photo-btn" onClick={() => fileRef.current?.click()} disabled={busy === "photo"}>
                <AiCamera size={15} />
                {busy === "photo" ? "Uploading…" : me?.avatarUrl ? "Change photo" : "Add a photo"}
              </button>
            </div>
          </div>
          <form className="stack" onSubmit={saveName}>
            <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></label>
            <button className="btn" type="submit" disabled={busy === "name"}>{busy === "name" ? "Saving…" : "Save name"}</button>
          </form>
        </section>

        <section className="axa-panel">
          <header className="axa-panel-title"><h2>Password</h2></header>
          <form className="stack" onSubmit={savePassword}>
            <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" minLength={8} required />
            <PasswordField label="Repeat it" value={pw2} onChange={setPw2} autoComplete="new-password" minLength={8} required />
            <button className="btn" type="submit" disabled={busy === "pw"}>{busy === "pw" ? "Saving…" : "Change password"}</button>
          </form>
          <hr className="axa-hr" />
          <button type="button" className="btn ghost" onClick={() => void signOut()}><AiLogout size={16} />Sign out</button>
        </section>
      </div>
    </AdminShell>
  );
}
