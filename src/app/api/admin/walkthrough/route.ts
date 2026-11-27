import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { isWalkthroughFile, walkthroughDir } from "@/lib/layama";

type Service = NonNullable<ReturnType<typeof createServiceSupabase>>;

async function slugOf(sb: Service, complexId: string) {
  const { data } = await sb.from("complexes").select("slug").eq("id", complexId).maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

async function setup(complexId: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.response } as const;
  const sb = createServiceSupabase();
  if (!sb) return { error: NextResponse.json({ error: "Storage is not configured" }, { status: 503 }) } as const;
  const slug = complexId ? await slugOf(sb, String(complexId)) : null;
  if (!slug) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) } as const;
  return { sb, slug } as const;
}

/** GET ?complexId= → the project's imported walk-through: { base, tour } (both null when none). */
export async function GET(req: Request) {
  const s = await setup(new URL(req.url).searchParams.get("complexId"));
  if ("error" in s) return s.error;
  const dir = walkthroughDir(s.slug);
  const { data } = await s.sb.storage.from("media").download(`${dir}/tour.json`);
  if (!data) return NextResponse.json({ base: null, tour: null });
  try {
    const tour = JSON.parse(await data.text());
    return NextResponse.json({ base: s.sb.storage.from("media").getPublicUrl(dir).data.publicUrl, tour });
  } catch {
    return NextResponse.json({ base: null, tour: null });
  }
}

/** POST { complexId, paths } → one signed upload per file (mesh.glb, <size>/<id>_<face>.<ext>). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { complexId?: string; paths?: unknown };
  const s = await setup(body.complexId);
  if ("error" in s) return s.error;
  const paths = Array.isArray(body.paths) ? body.paths.map(String).slice(0, 60) : [];
  if (!paths.length || paths.some((p) => !isWalkthroughFile(p) || p === "tour.json")) {
    return NextResponse.json({ error: "Unexpected file in the walk-through folder" }, { status: 400 });
  }
  const dir = walkthroughDir(s.slug);
  const uploads: { path: string; objectPath: string; token: string }[] = [];
  for (const p of paths) {
    const objectPath = `${dir}/${p}`;
    const { data, error } = await s.sb.storage.from("media").createSignedUploadUrl(objectPath, { upsert: true });
    if (error || !data) return NextResponse.json({ error: error?.message || "Could not start upload" }, { status: 500 });
    uploads.push({ path: p, objectPath, token: data.token });
  }
  return NextResponse.json({ uploads });
}

/** PUT { complexId, tour } → writes tour.json (after the import, and when rooms are renamed). Written last: it turns the walk-through on. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { complexId?: string; tour?: unknown };
  const s = await setup(body.complexId);
  if ("error" in s) return s.error;
  const tour = body.tour as { cameras?: unknown; floors?: unknown; mesh?: unknown } | undefined;
  if (!tour || !Array.isArray(tour.cameras) || !tour.cameras.length || !Array.isArray(tour.floors) || tour.mesh !== "mesh.glb") {
    return NextResponse.json({ error: "The walk-through data is not valid" }, { status: 400 });
  }
  const text = JSON.stringify(tour);
  if (text.length > 2_000_000) return NextResponse.json({ error: "Walk-through data too large" }, { status: 400 });
  const { error } = await s.sb.storage
    .from("media")
    .upload(`${walkthroughDir(s.slug)}/tour.json`, new Blob([text], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
      cacheControl: "60",
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
