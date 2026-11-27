import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { readSuspended, writeSuspended, type PortalStatus } from "@/lib/portal-status";

/** PUT { complexId, status }: active = live, pending = not live yet, suspended = offline on purpose. */
export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sb = createServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { complexId?: string; status?: PortalStatus };
  const id = String(body.complexId || "");
  const status = body.status;
  if (!id || !status || !["active", "pending", "suspended"].includes(status)) {
    return NextResponse.json({ error: "Missing status" }, { status: 400 });
  }
  const { error } = await sb.from("complexes").update({ published: status === "active" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const list = await readSuspended(sb);
  const next = status === "suspended" ? [...list, id] : list.filter((x) => x !== id);
  const { error: wErr } = await writeSuspended(sb, next);
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
