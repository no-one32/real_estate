import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { assetRelSegments } from "@/lib/asset-path";
import { readSuspended, type PortalStatus } from "@/lib/portal-status";

/** One row per project for the admin Portals / 360 / GLB pages: real counts, cover photo, logo, files. */
export type PortalOverview = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  description: string | null;
  published: boolean;
  /** active = live · pending = not live yet · suspended = taken offline by the admin */
  status: PortalStatus;
  created_at: string | null;
  clients: { id: string; name: string; email: string | null }[];
  visits: number;
  visits30: number;
  visitsPrev30: number;
  leads: number;
  units: number;
  cover: string | null;
  logo: string | null;
  agencyLogo: string | null;
  scenes: { id: string; path: string; sort_index: number }[];
  villa360: number;
  glb: { id: string; path: string }[];
  gallery: number;
  frames: number;
};

const DAY = 86_400_000;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sb = createServiceSupabase() ?? auth.supabase;

  const { data: complexes, error } = await sb.from("complexes").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (complexes ?? []).map((c) => c.id as string);

  const [{ data: assets }, { data: frames }, { data: members }, { data: profiles }, { data: units }] = await Promise.all([
    sb.from("assets").select("id, complex_id, kind, path, sort_index").in("kind", ["gallery", "branding", "scene_360", "villa_360", "glb"]).order("sort_index"),
    sb.from("assets").select("complex_id, path, sort_index").eq("kind", "frame_low").order("sort_index"),
    sb.from("complex_members").select("complex_id, profile_id"),
    sb.from("profiles").select("id, full_name, email").eq("role", "client"),
    sb.from("units").select("complex_id"),
  ]);

  const suspended = new Set(createServiceSupabase() ? await readSuspended(createServiceSupabase()!) : []);
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const since60 = new Date(now - 60 * DAY).toISOString();
  const head = () => sb.from("complex_visits").select("id", { count: "exact", head: true });
  const counts = await Promise.all(
    ids.map(async (id) => {
      const [all, last, prev, leads] = await Promise.all([
        head().eq("complex_id", id),
        head().eq("complex_id", id).gte("created_at", since30),
        head().eq("complex_id", id).gte("created_at", since60).lt("created_at", since30),
        sb.from("leads").select("id", { count: "exact", head: true }).eq("complex_id", id),
      ]);
      return { id, visits: all.count ?? 0, visits30: last.count ?? 0, visitsPrev30: prev.count ?? 0, leads: leads.count ?? 0 };
    }),
  );
  const countOf = new Map(counts.map((c) => [c.id, c]));
  const profileOf = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const portals: PortalOverview[] = (complexes ?? []).map((c) => {
    const mine = (assets ?? []).filter((a) => a.complex_id === c.id);
    const gallery = mine.filter((a) => a.kind === "gallery" && String(a.path).startsWith("http"));
    const coverRow = gallery.find((a) => assetRelSegments(a.path, "gallery").length === 1) ?? gallery[0];
    const firstFrame = (frames ?? []).find((f) => f.complex_id === c.id && String(f.path).startsWith("http"));
    const brand = mine.filter((a) => a.kind === "branding" && String(a.path).startsWith("http"));
    const nameOf = (a: { path: string }) => a.path.split("?")[0].split("/").pop()?.toLowerCase() || "";
    const logo = brand.find((a) => nameOf(a).startsWith("project.")) ?? null;
    const agency = brand.find((a) => nameOf(a).startsWith("agency.")) ?? (logo ? null : brand[0] ?? null);
    const clientIds = new Set<string>((members ?? []).filter((m) => m.complex_id === c.id).map((m) => m.profile_id as string));
    if (c.owner_id) clientIds.add(c.owner_id);
    const n = countOf.get(c.id);
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      city: c.city ?? null,
      description: c.description ?? null,
      published: Boolean(c.published),
      status: c.published ? "active" : suspended.has(c.id) ? "suspended" : "pending",
      created_at: c.created_at ?? null,
      clients: [...clientIds]
        .map((id) => profileOf.get(id))
        .filter(Boolean)
        .map((p) => ({ id: p!.id as string, name: (p!.full_name as string | null) || (p!.email as string | null) || "—", email: (p!.email as string | null) ?? null })),
      visits: n?.visits ?? 0,
      visits30: n?.visits30 ?? 0,
      visitsPrev30: n?.visitsPrev30 ?? 0,
      leads: n?.leads ?? 0,
      units: (units ?? []).filter((u) => u.complex_id === c.id).length,
      cover: coverRow?.path ?? firstFrame?.path ?? null,
      logo: logo?.path ?? null,
      agencyLogo: agency?.path ?? null,
      scenes: mine.filter((a) => a.kind === "scene_360").map((a) => ({ id: a.id, path: a.path, sort_index: a.sort_index })),
      villa360: mine.filter((a) => a.kind === "villa_360").length,
      glb: mine.filter((a) => a.kind === "glb").map((a) => ({ id: a.id, path: a.path })),
      gallery: gallery.length,
      frames: (frames ?? []).filter((f) => f.complex_id === c.id).length,
    };
  });

  return NextResponse.json({ portals, totalClients: profiles?.length ?? 0 });
}
