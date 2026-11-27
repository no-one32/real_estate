import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";

/** The signed-in admin's name, email and photo. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sb = createServiceSupabase() ?? auth.supabase;
  const { data } = await sb.from("profiles").select("full_name, avatar_url").eq("id", auth.user.id).maybeSingle();
  return NextResponse.json({
    name: (data?.full_name as string | null) || auth.user.email?.split("@")[0] || "Admin",
    email: auth.user.email ?? "",
    avatarUrl: (data?.avatar_url as string | null) ?? null,
  });
}

/** PATCH { full_name } */
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sb = createServiceSupabase() ?? auth.supabase;
  const body = (await req.json().catch(() => ({}))) as { full_name?: string };
  const name = String(body.full_name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const { error } = await sb.from("profiles").update({ full_name: name }).eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, name });
}
