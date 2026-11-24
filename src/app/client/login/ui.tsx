"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import DesignscapeLogo from "@/components/DesignscapeLogo";
import PasswordField from "@/components/PasswordField";
import "../../admin/admin.css";

export default function ClientLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = params.get("setup") === "1";
  const denied = params.get("denied") === "1";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const sb = createBrowserSupabase();
    if (!sb) {
      setErr("تسجيل الدخول غير متاح حالياً.");
      return;
    }
    setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr(error.message === "Invalid login credentials" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : error.message);
      return;
    }
    router.replace("/client");
    router.refresh();
  };

  return (
    <div className="gate" dir="rtl" lang="ar">
      <form className="gate-card" onSubmit={submit}>
        <DesignscapeLogo />
        <h1>مرحباً بك</h1>
        <p className="lede">سجّل الدخول لمتابعة مشروعك.</p>
        {setup && <p className="muted">هذه الصفحة غير جاهزة بعد.</p>}
        {denied && <p className="err">هذا الحساب لا يملك صلاحية الدخول.</p>}
        <label>البريد الإلكتروني <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
        <PasswordField label="كلمة المرور" value={password} onChange={setPassword} required showLabel="إظهار كلمة المرور" hideLabel="إخفاء كلمة المرور" />
        {err && <p className="err">{err}</p>}
        <button className="btn wide" type="submit" disabled={busy}>{busy ? "…" : "تسجيل الدخول"}</button>
        <a href="/client/forgot">نسيت كلمة المرور؟</a>
      </form>
    </div>
  );
}
