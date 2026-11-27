import type { createServiceSupabase } from "@/lib/supabase/service";

/**
 * Admin-only portal status. "Active" = the tour is live, "Pending" = not live yet,
 * "Suspended" = taken offline on purpose by the admin. Live/offline is the project's existing
 * `published` flag; the suspended list is kept in the media bucket (no database change).
 */
export type PortalStatus = "active" | "pending" | "suspended";
export const STATUS_PATH = "_admin/portal-status.json";

type Sb = NonNullable<ReturnType<typeof createServiceSupabase>>;

export async function readSuspended(sb: Sb): Promise<string[]> {
  const { data } = await sb.storage.from("media").download(STATUS_PATH);
  if (!data) return [];
  try {
    const json = JSON.parse(await data.text()) as { suspended?: unknown };
    return Array.isArray(json.suspended) ? json.suspended.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function writeSuspended(sb: Sb, ids: string[]) {
  return sb.storage
    .from("media")
    .upload(STATUS_PATH, new Blob([JSON.stringify({ suspended: [...new Set(ids)] })], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    });
}
