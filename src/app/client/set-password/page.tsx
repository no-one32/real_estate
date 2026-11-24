"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import DesignscapeLogo from "@/components/DesignscapeLogo";
import PasswordField from "@/components/PasswordField";
import { completeAuthFromUrl } from "@/lib/auth-link";
import "../../admin/admin.css";

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(params.get("error") || "");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = createBrowserSupabase();
    if (!sb) {
      setErr("تسجيل الدخول غير متاح حالياً.");
      return;
    }
    void completeAuthFromUrl(sb).then(({ session, error }) => {
      if (session) {
        setReady(true);
        setErr("");
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        return;
      }
      setReady(false);
      setErr(error || params.get("error") || "انتهت صلاحية هذا الرابط. اطلب دعوة جديدة.");
    });
  }, [params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setErr("استخدم 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirm) {
      setErr("كلمتا المرور غير متطابقتين.");
      return;
    }
    const sb = createBrowserSupabase();
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.replace("/client");
    router.refresh();
  };

  return (
    <div className="gate" dir="rtl" lang="ar">
      <form className="gate-card" onSubmit={submit}>
        <DesignscapeLogo />
        <h1>أنشئ كلمة مرور</h1>
        <p className="lede">بعدها ستتمكن من رؤية مشروعك.</p>
        {err && <p className="err">{err}</p>}
        <PasswordField showLabel="إظهار كلمة المرور" hideLabel="إخفاء كلمة المرور" label="كلمة المرور الجديدة" value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" disabled={!ready} />
        <PasswordField showLabel="إظهار كلمة المرور" hideLabel="إخفاء كلمة المرور" label="تأكيد كلمة المرور" value={confirm} onChange={setConfirm} required minLength={8} autoComplete="new-password" disabled={!ready} />
        <button className="btn wide" type="submit" disabled={busy || !ready}>{busy ? "جارٍ الحفظ…" : "متابعة"}</button>
      </form>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
