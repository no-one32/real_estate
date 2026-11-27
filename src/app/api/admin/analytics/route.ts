import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";

/**
 * Admin Dashboard / Analytics / Notifications data, over all projects.
 * GET ?days=30 (7 · 30 · 90): daily visits, per-project totals, sources, devices, recent leads.
 */
type Visit = { complex_id: string; created_at: string; source?: string | null; device?: string | null; duration_s?: number | null };

const DAY = 86_400_000;
const PAGE = 1000;

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sb = createServiceSupabase() ?? auth.supabase;
  const daysParam = Number(new URL(req.url).searchParams.get("days"));
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;

  const now = Date.now();
  const since = new Date(now - days * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const prevSince = new Date(since.getTime() - days * DAY);

  // this period + the one before (for the trend), paged
  const visits: Visit[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const page = (cols: string) =>
      sb.from("complex_visits").select(cols).gte("created_at", prevSince.toISOString()).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    let { data, error } = (await page("complex_id, created_at, source, device, duration_s")) as unknown as { data: Visit[] | null; error: { message: string } | null };
    // database without the analytics columns
    if (error) ({ data, error } = (await page("complex_id, created_at")) as unknown as { data: Visit[] | null; error: { message: string } | null });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    visits.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const [{ data: complexes }, { data: leads }, { count: leadsTotal }, { count: leadsPeriod }] = await Promise.all([
    sb.from("complexes").select("id, name, slug, published"),
    sb
      .from("leads")
      .select("id, created_at, nom, prenom, email, tel, unit_display_id, complex_id, status, subject")
      .order("created_at", { ascending: false })
      .limit(30),
    sb.from("leads").select("id", { count: "exact", head: true }),
    sb.from("leads").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()),
  ]);

  const cur = visits.filter((v) => new Date(v.created_at) >= since);
  const prev = visits.filter((v) => new Date(v.created_at) < since);

  const daily: { day: string; visits: number }[] = [];
  for (let t = since.getTime(); t <= now; t += DAY) daily.push({ day: new Date(t).toISOString().slice(0, 10), visits: 0 });
  const dayIndex = new Map(daily.map((d, i) => [d.day, i]));
  for (const v of cur) {
    const i = dayIndex.get(v.created_at.slice(0, 10));
    if (i !== undefined) daily[i].visits += 1;
  }

  const tally = (key: (v: Visit) => string) => {
    const m = new Map<string, number>();
    for (const v of cur) m.set(key(v), (m.get(key(v)) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count);
  };

  const nameOf = new Map((complexes ?? []).map((c) => [c.id as string, c.name as string]));
  const perProject = (complexes ?? [])
    .map((c) => {
      const mine = cur.filter((v) => v.complex_id === c.id);
      const before = prev.filter((v) => v.complex_id === c.id).length;
      const secs = mine.map((v) => v.duration_s ?? 0).filter((s) => s > 0);
      return {
        id: c.id as string,
        name: c.name as string,
        slug: c.slug as string,
        published: Boolean(c.published),
        visits: mine.length,
        before,
        avgSeconds: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : 0,
      };
    })
    .sort((a, b) => b.visits - a.visits);

  const allSecs = cur.map((v) => v.duration_s ?? 0).filter((s) => s > 0);

  return NextResponse.json({
    days,
    totals: {
      visits: cur.length,
      visitsBefore: prev.length,
      leads: leadsTotal ?? 0,
      leadsPeriod: leadsPeriod ?? 0,
      avgSeconds: allSecs.length ? Math.round(allSecs.reduce((a, b) => a + b, 0) / allSecs.length) : 0,
    },
    daily,
    perProject,
    sources: tally((v) => v.source || "direct"),
    devices: tally((v) => v.device || "unknown"),
    recentLeads: (leads ?? []).map((l) => ({ ...l, project: nameOf.get(l.complex_id as string) ?? "—" })),
  });
}
