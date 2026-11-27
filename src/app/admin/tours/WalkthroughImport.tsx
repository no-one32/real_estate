"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { buildWalkthroughTour, pickWalkthroughFiles, withRoomBar } from "@/lib/layama";
import type { TourData } from "@/viewer/Visite360Engine";
import { AiUpload } from "../AdminIcons";

type Props = { complexId: string; projectName: string; onDone: () => void; onError: (m: string) => void };

/**
 * Import of the 3D designer's walk-through export (the Layama folder):
 * layama.scene.js (where you can stand), mesh.glb (shape of the house), jpg/base/<size>/… (6 images per point).
 */
export default function WalkthroughImport({ complexId, projectName, onDone, onError }: Props) {
  const [busy, setBusy] = useState("");

  const run = async (all: File[]) => {
    onError("");
    const picked = pickWalkthroughFiles(all);
    if (!picked.scene || !picked.mesh || !picked.upload.length) {
      onError(
        `This is not a walk-through export. The folder needs layama.scene.js, mesh.glb and jpg/base/2048 (missing: ${[
          !picked.scene && "layama.scene.js",
          !picked.mesh && "mesh.glb",
          !picked.upload.length && "the images",
        ]
          .filter(Boolean)
          .join(", ")}).`,
      );
      return;
    }
    const tour = buildWalkthroughTour(await picked.scene.text(), picked.ext, picked.sizes);
    if (!tour.cameras.length) return onError("No standing points found in layama.scene.js.");
    const missing = tour.cameras.filter((c) => !picked.upload.some((u) => u.path.startsWith(`${tour.resolutions[0]}/${c.n}_`)));
    if (missing.length) return onError(`Images missing for ${missing.length} point(s) (e.g. ${missing[0].n}).`);

    // keep the room names of a previous import when the points are the same
    const prev = await fetch(`/api/admin/walkthrough?complexId=${complexId}`).then((r) => r.json()).catch(() => null);
    const prevTour = prev?.tour as TourData | null;
    if (prevTour?.cameras) {
      const names = new Map(prevTour.cameras.map((c) => [c.n, c.lb]));
      tour.cameras = tour.cameras.map((c) => ({ ...c, lb: names.get(c.n) || undefined }));
    }

    const sb = createBrowserSupabase();
    if (!sb) return onError("Storage is not configured");
    const files = [{ path: "mesh.glb", file: picked.mesh }, ...picked.upload];
    let done = 0;
    setBusy(`Uploading 0 / ${files.length}`);
    try {
      for (let i = 0; i < files.length; i += 40) {
        const batch = files.slice(i, i + 40);
        const res = await fetch("/api/admin/walkthrough", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ complexId, paths: batch.map((f) => f.path) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not start the upload");
        const tokens = new Map<string, { objectPath: string; token: string }>(json.uploads.map((u: { path: string; objectPath: string; token: string }) => [u.path, u]));
        let next = 0;
        await Promise.all(
          Array.from({ length: 4 }, async () => {
            while (next < batch.length) {
              const f = batch[next++];
              const t = tokens.get(f.path)!;
              const type = f.path.endsWith(".glb") ? "model/gltf-binary" : f.path.endsWith(".webp") ? "image/webp" : "image/jpeg";
              const { error } = await sb.storage.from("media").uploadToSignedUrl(t.objectPath, t.token, f.file, { contentType: type, upsert: true });
              if (error) throw new Error(`${f.path}: ${error.message}`);
              done += 1;
              setBusy(`Uploading ${done} / ${files.length}`);
            }
          }),
        );
      }
      // tour.json last: it is what turns the walk-through on
      setBusy("Finishing…");
      const res = await fetch("/api/admin/walkthrough", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexId, tour: withRoomBar(tour) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not finish the import");
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="axa-panel axa-import">
      <h2>Import the villa walk-through · {projectName}</h2>
      <p>
        Choose the folder the 3D designer exported with Layama (from 3ds Max). It contains <b>layama.scene.js</b>, <b>mesh.glb</b> and a <b>jpg</b> folder with the
        images of every point.
      </p>
      <label className={`btn${busy ? " disabled" : ""}`}>
        <input
          type="file"
          hidden
          multiple
          disabled={!!busy}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (list.length) void run(list);
          }}
        />
        <AiUpload size={16} />
        {busy || "Choose the export folder"}
      </label>
    </div>
  );
}
