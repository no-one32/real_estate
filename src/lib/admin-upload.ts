"use client";

import { createBrowserSupabase } from "@/lib/supabase/browser";
import { filesForKind, relativeUploadPath } from "@/lib/upload-files";
import { optimizeUploadFile } from "@/lib/image-optimize";
import type { AssetKind } from "@/lib/types";

export type BrandSlot = "agency" | "project";

async function pool<T>(items: T[], width: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i];
      i += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Upload files of one kind to a project: optimise → signed upload → save the asset row.
 * Returns how many were saved and the last error (if any).
 */
export async function uploadAssets(
  complexId: string,
  files: File[],
  kind: AssetKind,
  opts: { brandSlot?: BrandSlot; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ ok: number; total: number; error: string }> {
  const list = filesForKind(files, kind).slice(0, opts.brandSlot ? 1 : undefined);
  if (!list.length) return { ok: 0, total: 0, error: "No usable files in that selection" };
  const sb = createBrowserSupabase();
  if (!sb) return { ok: 0, total: list.length, error: "Storage is not configured" };

  let ok = 0;
  let lastErr = "";
  opts.onProgress?.(0, list.length);
  await pool(list, kind === "frame_high" ? 2 : 3, async (raw) => {
    const file = await optimizeUploadFile(raw, kind);
    const rel = opts.brandSlot
      ? `${opts.brandSlot}.${(file.name.split(".").pop() || "webp").toLowerCase()}`
      : relativeUploadPath(file);
    const prepRes = await fetch("/api/admin/assets/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId, kind, relativePath: rel, contentType: file.type }),
    });
    const prep = await prepRes.json().catch(() => ({}));
    if (!prepRes.ok) {
      lastErr = typeof prep.error === "string" ? prep.error : "Could not start upload";
      return;
    }
    const { error: upErr } = await sb.storage.from(prep.bucket).uploadToSignedUrl(prep.objectPath, prep.token, file, {
      contentType: prep.contentType,
    });
    if (upErr) {
      lastErr = upErr.message;
      return;
    }
    const commitRes = await fetch("/api/admin/assets/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId, kind, stored: prep.stored, sort_index: prep.sort_index }),
    });
    const commit = await commitRes.json().catch(() => ({}));
    if (!commitRes.ok) {
      lastErr = typeof commit.error === "string" ? commit.error : "Could not save file";
      return;
    }
    ok += 1;
    opts.onProgress?.(ok, list.length);
  });
  return { ok, total: list.length, error: lastErr };
}
