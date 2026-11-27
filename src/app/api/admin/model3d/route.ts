import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { cleanModelConfig, EMPTY_MODEL_CONFIG, modelConfigPath, modelDir, type ModelConfig } from "@/lib/model3d";

type Service = NonNullable<ReturnType<typeof createServiceSupabase>>;

async function setup(complexId: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.response } as const;
  const sb = createServiceSupabase();
  if (!sb) return { error: NextResponse.json({ error: "Storage is not configured" }, { status: 503 }) } as const;
  const { data } = complexId ? await sb.from("complexes").select("slug").eq("id", String(complexId)).maybeSingle() : { data: null };
  const slug = (data?.slug as string | undefined) ?? null;
  if (!slug) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) } as const;
  return { sb, slug } as const;
}

async function readConfig(sb: Service, slug: string): Promise<ModelConfig> {
  const { data } = await sb.storage.from("media").download(modelConfigPath(slug));
  if (!data) return EMPTY_MODEL_CONFIG;
  try {
    return cleanModelConfig(JSON.parse(await data.text()));
  } catch {
    return EMPTY_MODEL_CONFIG;
  }
}

/** GET ?complexId= → { config } (the real 3D model and its pins). */
export async function GET(req: Request) {
  const s = await setup(new URL(req.url).searchParams.get("complexId"));
  if ("error" in s) return s.error;
  return NextResponse.json({ config: await readConfig(s.sb, s.slug) });
}

/** POST { complexId, kind: "model" | "photo", pinId? } → a signed upload straight to storage + the file's public URL. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { complexId?: string; kind?: string; pinId?: string };
  const s = await setup(body.complexId);
  if ("error" in s) return s.error;
  const dir = modelDir(s.slug);
  let objectPath: string;
  if (body.kind === "model") objectPath = `${dir}/interactive.glb`;
  else if (body.kind === "photo") objectPath = `${dir}/pins/${String(body.pinId || "pin").replace(/[^\w-]/g, "").slice(0, 40)}-${Date.now()}.webp`;
  else return NextResponse.json({ error: "Unknown file" }, { status: 400 });
  const { data, error } = await s.sb.storage.from("media").createSignedUploadUrl(objectPath, { upsert: true });
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not start upload" }, { status: 500 });
  const publicUrl = s.sb.storage.from("media").getPublicUrl(objectPath).data.publicUrl;
  return NextResponse.json({ objectPath, token: data.token, publicUrl });
}

/** PUT { complexId, modelUrl?, pins? } → saves only the parts sent. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { complexId?: string; modelUrl?: unknown; pins?: unknown };
  const s = await setup(body.complexId);
  if ("error" in s) return s.error;
  const current = await readConfig(s.sb, s.slug);
  const next = cleanModelConfig({
    ...current,
    ...("modelUrl" in body ? { modelUrl: body.modelUrl } : {}),
    ...("pins" in body ? { pins: body.pins } : {}),
  });
  const saved = { ...next, updatedAt: new Date().toISOString() };
  const { error } = await s.sb.storage
    .from("media")
    .upload(modelConfigPath(s.slug), new Blob([JSON.stringify(saved)], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
      cacheControl: "60",
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: saved });
}
