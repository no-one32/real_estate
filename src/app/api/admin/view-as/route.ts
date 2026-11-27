import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

/** POST { clientId }: the admin enters this client's portal (/client). */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sb = createServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { clientId?: string };
  const id = String(body.clientId || "");
  const { data } = await sb.from("profiles").select("id, role").eq("id", id).maybeSingle();
  if (!data || data.role !== "client") return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIEW_AS_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}

/** DELETE: leave the client's portal. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
