/**
 * Exports shared by Contacts, Apartments and Analytics.
 * CSV: UTF-8 with BOM (opens in Excel, Arabic included). Raw values, so the Apartments CSV works as an import template.
 * PDF: a branded A4 report (header, summary, table) printed through the browser's "Save as PDF".
 * Columns that are empty on every row are left out of both formats.
 */

export type Tone = "green" | "amber" | "red" | "blue" | "grey";

export type ExportCol = {
  /** money / number → "280,000"; both right-aligned in the PDF */
  format?: "money" | "number";
  /** draw the cell as a coloured pill: value → tone */
  tones?: Record<string, Tone>;
  /** gets more room in the PDF (notes, villa lists) */
  wide?: boolean;
};

export type ExportTable = {
  title: string;
  /** small line under the title, e.g. the project name or the period */
  subtitle?: string;
  head: string[];
  rows: string[][];
  /** per-column hints for the PDF, same order as head */
  cols?: ExportCol[];
  /** key figures shown above the table in the PDF */
  summary?: { label: string; value: string; tone?: Tone }[];
  /** what one row is, for the count line ("contact", "villa"…) */
  noun?: string;
};

const stamp = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";

/** drop columns that are empty everywhere */
function compact(t: ExportTable): ExportTable {
  const keep = t.head.map((_, i) => t.rows.some((r) => (r[i] ?? "").trim() !== ""));
  if (keep.every(Boolean) || !t.rows.length) return t;
  const pick = <T,>(a: T[]) => a.filter((_, i) => keep[i]);
  return { ...t, head: pick(t.head), rows: t.rows.map(pick), cols: t.cols ? pick(t.cols) : undefined };
}

export function exportExcel(table: ExportTable) {
  const t = compact(table);
  const cell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = [t.head, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(t.title)}-${stamp()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const num = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? n.toLocaleString("en-US") : v;
};

function cellHtml(v: string, col: ExportCol | undefined) {
  if (!v.trim()) return `<td class="empty">—</td>`;
  if (col?.tones) return `<td><span class="pill ${col.tones[v] ?? "grey"}">${esc(v)}</span></td>`;
  if (col?.format) return `<td class="r">${esc(num(v))}</td>`;
  return `<td dir="auto"${col?.wide ? ' class="wide"' : ""}>${esc(v)}</td>`;
}

export function exportPdf(table: ExportTable) {
  const t = compact(table);
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const noun = t.noun ?? "row";
  const count = `${t.rows.length.toLocaleString("en-US")} ${noun}${t.rows.length === 1 ? "" : "s"}`;
  const many = t.head.length > 7;
  const logo = `${location.origin}/branding/axis.png`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.title)} · ${stamp()}</title>
<style>
  /* margin 0: leaves no room for the browser's own header/footer (site address, date, title).
     The page margins come from the .page table below: its empty head/foot rows repeat on every page. */
  @page { size: A4 ${many ? "landscape" : "portrait"}; margin: 0; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 100%; border-collapse: collapse; }
  .page > thead > tr > td { height: 14mm; padding: 0; }
  .page > tfoot > tr > td { height: 16mm; padding: 0; }
  .page > tbody > tr > td { padding: 0 14mm; }
  body { margin: 0; font: 10px/1.45 Inter, "Segoe UI", "Noto Sans Arabic", Tahoma, Arial, sans-serif; color: #0c1323; }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 2px solid #0c1323; }
  header img { width: 34px; height: 44px; object-fit: contain; }
  header .t { flex: 1; }
  header h1 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.2px; }
  header p { margin: 2px 0 0; font-size: 10.5px; color: #64708a; }
  header .meta { text-align: right; font-size: 9.5px; color: #64708a; line-height: 1.6; }
  header .meta b { display: block; color: #0c1323; font-size: 10.5px; }
  .sum { display: flex; gap: 8px; margin: 16px 0 14px; }
  .sum div { flex: 1; padding: 10px 12px; border-radius: 10px; background: #f3f6fc; border: 1px solid #e3e9f5; }
  .sum span { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #7a86a0; }
  .sum b { display: block; margin-top: 3px; font-size: 17px; font-weight: 700; }
  .sum .green b { color: #15803d; } .sum .amber b { color: #b45309; } .sum .red b { color: #c62828; } .sum .blue b { color: #1d4ed8; }
  .data { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: ${t.summary?.length ? 0 : 16}px; }
  .data thead { display: table-header-group; }
  .data th { padding: 8px 9px; background: #0c1323; color: #fff; font-size: 8.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; white-space: nowrap; }
  .data th:first-child { border-radius: 7px 0 0 7px; } .data th:last-child { border-radius: 0 7px 7px 0; }
  .data th.r { text-align: right; }
  .data td { padding: 7px 9px; border-bottom: 1px solid #edf1f7; vertical-align: top; white-space: nowrap; }
  .data tbody tr:nth-child(even) td { background: #f8faff; }
  .data tr { break-inside: avoid; }
  .data td:first-child { font-weight: 600; }
  .data td.r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .data td.wide { min-width: 140px; max-width: 260px; color: #3f4c69; white-space: normal; }
  .data td.empty { color: #c3cad8; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 8.5px; font-weight: 600; white-space: nowrap; }
  .pill.green { background: #e3f7ec; color: #15803d; } .pill.amber { background: #fff3d9; color: #b45309; }
  .pill.red { background: #fde7e7; color: #c62828; } .pill.blue { background: #e6eeff; color: #1d4ed8; } .pill.grey { background: #eef1f6; color: #5b6780; }
  .none { margin-top: 30px; text-align: center; color: #7a86a0; font-size: 12px; }
</style></head><body>
<table class="page"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
<header>
  <img src="${logo}" alt="">
  <div class="t"><h1>${esc(t.title)}</h1>${t.subtitle ? `<p>${esc(t.subtitle)}</p>` : ""}</div>
  <div class="meta"><b>${esc(date)}</b>${esc(count)}</div>
</header>
${t.summary?.length ? `<div class="sum">${t.summary.map((s) => `<div class="${s.tone ?? ""}"><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`).join("")}</div>` : ""}
${t.rows.length
    ? `<table class="data"><thead><tr>${t.head.map((h, i) => `<th${t.cols?.[i]?.format ? ' class="r"' : ""}>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => cellHtml(c ?? "", t.cols?.[i])).join("")}</tr>`).join("")}</tbody></table>`
    : `<p class="none">Nothing to export.</p>`}
</td></tr></tbody></table>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const done = () => setTimeout(() => frame.remove(), 1000);
  frame.contentWindow?.addEventListener("afterprint", done);
  // wait for the logo (and fonts) so the first page is complete
  const img = doc.querySelector("img");
  const ready = img && !img.complete ? new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 1500); }) : Promise.resolve();
  void Promise.all([ready, doc.fonts?.ready]).then(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(done, 60_000); // fallback if afterprint never fires
  });
}
