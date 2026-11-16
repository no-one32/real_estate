import { NextResponse } from "next/server";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { listComplexIdsForUser } from "@/lib/members";

const SIZES = [512, 1024, 2048];
/** a 256 px PNG data URL is far below this */
const MAX_LOGO = 400_000;
const COLUMNS = "id, complex_id, label, url, size, logo, created_at";

/** Signed-in client + the projects they can open. */
async function access() {
  const auth = await requireClient();
  if (!auth.ok) return { error: auth.response };
  const service = createServiceSupabase() ?? auth.supabase;
  const projects = await listComplexIdsForUser(service, auth.user.id);
  return { service, projects, userId: auth.user.id };
}

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** GET ?complexId=… → this project's codes, newest first */
export async function GET(req: Request) {
  const a = await access();
  if ("error" in a) return a.error;
  const complexId = new URL(req.url).searchParams.get("complexId") ?? "";
  if (!a.projects.includes(complexId)) return forbidden();
  const { data, error } = await a.service
    .from("qr_codes")
    .select(COLUMNS)
    .eq("complex_id", complexId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: data ?? [] });
}

/** POST { complexId, label, url, size, logo? } → the saved code */
export async function POST(req: Request) {
  const a = await access();
  if ("error" in a) return a.error;
  const body = await req.json().catch(() => null);
  const complexId = String(body?.complexId ?? "");
  if (!a.projects.includes(complexId)) return forbidden();

  const url = String(body?.url ?? "").trim();
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
  } catch {
    return NextResponse.json({ error: "Enter a full link starting with https://" }, { status: 400 });
  }
  const size = Number(body?.size);
  if (!SIZES.includes(size)) return NextResponse.json({ error: "Unknown size" }, { status: 400 });
  const label = String(body?.label ?? "").trim().slice(0, 40);
  const logo = body?.logo ? String(body.logo) : null;
  if (logo && (!logo.startsWith("data:image/png;base64,") || logo.length > MAX_LOGO)) {
    return NextResponse.json({ error: "The center image is too large" }, { status: 400 });
  }

  const { data, error } = await a.service
    .from("qr_codes")
    .insert({ complex_id: complexId, created_by: a.userId, label, url, size, logo })
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code: data });
}

/** DELETE { id } */
export async function DELETE(req: Request) {
  const a = await access();
  if ("error" in a) return a.error;
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id || !a.projects.length) return forbidden();
  const { data, error } = await a.service
    .from("qr_codes")
    .delete()
    .eq("id", id)
    .in("complex_id", a.projects)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return forbidden();
  return NextResponse.json({ ok: true });
}
