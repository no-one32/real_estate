"use client";

import { useState } from "react";
import Link from "next/link";
import DesignscapeLogo from "@/components/DesignscapeLogo";
import "../../admin/admin.css";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch("/api/client/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr("تعذر إرسال البريد الإلكتروني.");
      return;
    }
    setOk(true);
  };

  return (
    <div className="gate" dir="rtl" lang="ar">
      <form className="gate-card" onSubmit={submit}>
        <DesignscapeLogo />
        <h1>إعادة تعيين كلمة المرور</h1>
        <p className="lede">سنرسل لك رابطاً لاختيار كلمة مرور جديدة.</p>
        {ok ? <p className="ok">إذا كان هذا البريد مسجلاً، فالرابط في طريقه إليك.</p> : (
          <>
            <label>البريد الإلكتروني <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
            {err && <p className="err">{err}</p>}
            <button className="btn wide" type="submit" disabled={busy}>{busy ? "…" : "إرسال الرابط"}</button>
          </>
        )}
        <Link href="/client/login">العودة إلى تسجيل الدخول</Link>
      </form>
    </div>
  );
}
