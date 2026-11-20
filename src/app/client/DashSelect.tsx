"use client";

import { useEffect, useRef, useState } from "react";
import { IcChevronDown } from "./DashIcons";

/**
 * Drop-down used in the dashboard filters and forms, in place of the browser's <select>
 * (whose list can't be styled). The list has the same look as the country-code list
 * (+966, +216…) of the tour's contact form: white, rounded, blue selected row, thin scrollbar.
 */
export type DashOption<V extends string | number> = { value: V; label: string };

export default function DashSelect<V extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "axc-select",
  chevron = 17,
}: {
  value: V;
  options: DashOption<V>[];
  onChange: (v: V) => void;
  ariaLabel?: string;
  /** wrapper look: "axc-select" (filters), "axc-select wide", "axq-select" (QR form) */
  className?: string;
  chevron?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    // selected row in view when the list opens
    const list = listRef.current;
    const on = list?.querySelector<HTMLElement>("button.on");
    if (list && on) list.scrollTop = on.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2;
    const onDoc = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className={`${className} dsel${open ? " open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="dsel-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.label ?? ""}
      </button>
      <IcChevronDown size={chevron} />
      {open ? (
        <ul className="dsel-list" role="listbox" aria-label={ariaLabel} ref={listRef}>
          {options.map((o) => (
            <li key={String(o.value)} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={o.value === value ? "on" : undefined}
                onClick={() => {
                  setOpen(false);
                  if (o.value !== value) onChange(o.value);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
