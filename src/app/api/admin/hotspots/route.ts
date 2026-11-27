import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { cleanHotspots, EMPTY_HOTSPOTS, hotspotsPath } from "@/lib/hotspots";

async function projectSlug(sb: NonNullable<ReturnType<typeof createServiceSupabase>>, complexId: string) {
  const { data } = await sb.from("complexes").select("slug").eq("id", complexId).maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

/** GET ?complexId= → the project's hotspots (empty when none saved yet). */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sb = createServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });
  const complexId = new URL(req.url).searchParams.get("complexId") || "";
  const slug = complexId ? await projectSlug(sb, complexId) : null;
  if (!slug) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const { data } = await sb.storage.from("media").download(hotspotsPath(slug));
  if (!data) return NextResponse.json({ hotspots: EMPTY_HOTSPOTS });
  try {
    return NextResponse.json({ hotspots: cleanHotspots(JSON.parse(await data.text())) });
  } catch {
    return NextResponse.json({ hotspots: EMPTY_HOTSPOTS });
  }
}

/** PUT: saves the project's hotspots file. */
export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sb = createServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });
  // { complexId | slug, hotspots } replaces the whole file.
  // Otherwise only the parts sent are replaced: { scenes, startScene } from the 360 builder, { mapPins } from the tour edit mode.
  const body = (await req.json().catch(() => ({}))) as {
    complexId?: string;
    slug?: string;
    hotspots?: unknown;
    mapPins?: unknown;
    scenes?: unknown;
    startScene?: unknown;
    inside?: unknown;
  };
  let slug: string | null = null;
  if (body.complexId) slug = await projectSlug(sb, String(body.complexId));
  else if (body.slug) {
    const { data } = await sb.from("complexes").select("slug").eq("slug", String(body.slug)).maybeSingle();
    slug = (data?.slug as string | undefined) ?? null;
  }
  if (!slug) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  let next: unknown = body.hotspots;
  if (body.hotspots === undefined) {
    const { data } = await sb.storage.from("media").download(hotspotsPath(slug));
    const current = data ? cleanHotspots(JSON.parse(await data.text().catch(() => "{}"))) : EMPTY_HOTSPOTS;
    next = {
      ...current,
      ...("mapPins" in body ? { mapPins: body.mapPins } : {}),
      ...("scenes" in body ? { scenes: body.scenes } : {}),
      ...("startScene" in body ? { startScene: body.startScene } : {}),
      ...("inside" in body ? { inside: body.inside } : {}),
    };
  }
  const hotspots = { ...cleanHotspots(next), updatedAt: new Date().toISOString() };
  const { error } = await sb.storage
    .from("media")
    .upload(hotspotsPath(slug), new Blob([JSON.stringify(hotspots)], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
      cacheControl: "60",
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hotspots });
}
