"use client";

import { useCallback, useState } from "react";

/** labels: the buttons' text (the client dashboard passes Arabic; admin keeps the English defaults) */
export function useConfirm(labels: { cancel?: string; ok?: string; title?: string } = {}) {
  const [box, setBox] = useState<{ title: string; message: string; resolve: (ok: boolean) => void } | null>(null);

  const defaultTitle = labels.title ?? "Are you sure?";
  const confirm = useCallback((message: string, title = defaultTitle) => {
    return new Promise<boolean>((resolve) => setBox({ title, message, resolve }));
  }, [defaultTitle]);

  const close = (ok: boolean) => {
    box?.resolve(ok);
    setBox(null);
  };

  const dialog = box ? (
    <div className="warn-overlay" role="alertdialog" aria-modal="true" onClick={() => close(false)}>
      <div className="warn-card" onClick={(e) => e.stopPropagation()}>
        <h3>{box.title}</h3>
        <p>{box.message}</p>
        <div className="warn-actions">
          <button type="button" className="btn ghost" onClick={() => close(false)}>{labels.cancel ?? "Cancel"}</button>
          <button type="button" className="btn" onClick={() => close(true)}>{labels.ok ?? "OK"}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
