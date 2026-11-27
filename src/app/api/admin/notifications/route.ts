import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";

/** Newest interested buyers over all projects. GET ?since=ISO → how many came after that moment. */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sb = createServiceSupabase() ?? auth.supabase;
  const since = new URL(req.url).searchParams.get("since");
  const sinceOk = since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : null;
  const [{ data: leads }, { data: complexes }, unseen] = await Promise.all([
    sb
      .from("leads")
      .select("id, created_at, nom, prenom, email, tel, unit_display_id, complex_id, status, subject, message")
      .order("created_at", { ascending: false })
      .limit(40),
    sb.from("complexes").select("id, name"),
    sinceOk
      ? sb.from("leads").select("id", { count: "exact", head: true }).gt("created_at", sinceOk)
      : sb.from("leads").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ]);
  const nameOf = new Map((complexes ?? []).map((c) => [c.id as string, c.name as string]));
  return NextResponse.json({
    unseen: unseen.count ?? 0,
    leads: (leads ?? []).map((l) => ({ ...l, project: nameOf.get(l.complex_id as string) ?? "—" })),
  });
}
