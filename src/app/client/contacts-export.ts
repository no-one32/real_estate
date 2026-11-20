/**
 * Exports shared by Contacts, Apartments and Analytics.
 * Excel: a real .xlsx workbook (dark header row, number columns as numbers). It also works as the Apartments import template.
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

/* ---------------- Excel (.xlsx) ----------------
   A real Excel workbook, written by hand: an .xlsx is a zip of a few XML files.
   The zip is "stored" (not compressed), which every spreadsheet app reads. */

const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)
  // characters XML 1.0 does not allow
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const colName = (i: number) => {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; text: string }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end] as BlobPart[], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function exportExcel(table: ExportTable) {
  const t = compact(table);
  const isNum = (v: string, i: number) => Boolean(t.cols?.[i]?.format) && v.trim() !== "" && Number.isFinite(Number(v.replace(/,/g, "")));
  const cell = (v: string, r: number, i: number, head: boolean) => {
    const ref = `${colName(i)}${r + 1}`;
    if (!head && isNum(v, i)) return `<c r="${ref}"${t.cols?.[i]?.format === "money" ? ' s="2"' : ""}><v>${Number(v.replace(/,/g, ""))}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${head ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };
  const all = [t.head, ...t.rows];
  // column width from the longest text in it (Excel units ≈ characters)
  const widths = t.head.map((_, i) => Math.min(60, Math.max(10, ...all.map((r) => (r[i] ?? "").length + 2))));
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${all.map((r, ri) => `<row r="${ri + 1}">${r.map((v, i) => cell(v ?? "", ri, i, ri === 0)).join("")}</row>`).join("")}</sheetData>
${t.rows.length ? `<autoFilter ref="A1:${colName(t.head.length - 1)}${t.rows.length + 1}"/>` : ""}
</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C1323"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;
  const sheetName = xml(t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  const blob = zipStore([
    { name: "[Content_Types].xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>${t.rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName.replace(/'/g, "''")}'!$A$1:$${colName(t.head.length - 1)}$${t.rows.length + 1}</definedName></definedNames>` : ""}</workbook>` },
    { name: "xl/_rels/workbook.xml.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", text: sheet },
    { name: "xl/styles.xml", text: styles },
  ]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(t.title)}-${stamp()}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Read the first sheet of an .xlsx file as rows of text (for the Apartments import). */
export async function readXlsx(file: Blob): Promise<string[][]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  // end of central directory: last 0x06054b50 signature
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map<string, { method: number; size: number; offset: number }>();
  for (let n = 0; n < count; n++) {
    const nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true);
    const comment = dv.getUint16(p + 32, true);
    entries.set(dec.decode(buf.subarray(p + 46, p + 46 + nameLen)), { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), offset: dv.getUint32(p + 42, true) });
    p += 46 + nameLen + extra + comment;
  }
  const read = async (name: string) => {
    const e = entries.get(name);
    if (!e) return "";
    const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
    const raw = buf.slice(start, start + e.size);
    if (e.method === 0) return dec.decode(raw);
    const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(out).text();
  };
  const sheetName = entries.has("xl/worksheets/sheet1.xml") ? "xl/worksheets/sheet1.xml" : [...entries.keys()].find((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)) ?? "";
  const parse = (s: string) => new DOMParser().parseFromString(s, "application/xml");
  const textOf = (el: Element) => [...el.getElementsByTagName("t")].map((t) => t.textContent ?? "").join("");
  const shared = [...parse(await read("xl/sharedStrings.xml") || "<sst/>").getElementsByTagName("si")].map(textOf);
  const doc = parse(await read(sheetName));
  const colIndex = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? "A")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows: string[][] = [];
  for (const row of doc.getElementsByTagName("row")) {
    const r: string[] = [];
    for (const c of row.getElementsByTagName("c")) {
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const val = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? textOf(c) : v;
      r[colIndex(c.getAttribute("r") ?? "A")] = val;
    }
    const filled = Array.from({ length: r.length }, (_, i) => r[i] ?? "");
    if (filled.some((x) => x.trim())) rows.push(filled);
  }
  return rows;
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
  const date = new Date().toLocaleDateString("ar-u-nu-latn", { month: "long", day: "numeric", year: "numeric" });
  const noun = t.noun ?? "صف";
  const count = `${t.rows.length.toLocaleString("en-US")} ${noun}`;
  const many = t.head.length > 7;
  const logo = `${location.origin}/branding/axis.png`;

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(t.title)} · ${stamp()}</title>
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
  body { margin: 0; font: 10px/1.5 "Noto Sans Arabic", Inter, "Segoe UI", Tahoma, Arial, sans-serif; color: #0c1323; }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 2px solid #0c1323; }
  header img { width: 34px; height: 44px; object-fit: contain; }
  header .t { flex: 1; }
  header h1 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.2px; }
  header p { margin: 2px 0 0; font-size: 10.5px; color: #64708a; }
  header .meta { text-align: left; font-size: 9.5px; color: #64708a; line-height: 1.6; }
  header .meta b { display: block; color: #0c1323; font-size: 10.5px; }
  .sum { display: flex; gap: 8px; margin: 16px 0 14px; }
  .sum div { flex: 1; padding: 10px 12px; border-radius: 10px; background: #f3f6fc; border: 1px solid #e3e9f5; }
  .sum span { display: block; font-size: 9px; color: #7a86a0; }
  .sum b { display: block; margin-top: 3px; font-size: 17px; font-weight: 700; }
  .sum .green b { color: #15803d; } .sum .amber b { color: #b45309; } .sum .red b { color: #c62828; } .sum .blue b { color: #1d4ed8; }
  .data { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: ${t.summary?.length ? 0 : 16}px; }
  .data thead { display: table-header-group; }
  .data th { padding: 8px 9px; background: #0c1323; color: #fff; font-size: 9px; font-weight: 600; text-align: right; white-space: nowrap; }
  .data th:first-child { border-radius: 0 7px 7px 0; } .data th:last-child { border-radius: 7px 0 0 7px; }
  .data th.r { text-align: left; }
  .data td { padding: 7px 9px; border-bottom: 1px solid #edf1f7; vertical-align: top; white-space: nowrap; }
  .data tbody tr:nth-child(even) td { background: #f8faff; }
  .data tr { break-inside: avoid; }
  .data td:first-child { font-weight: 600; }
  .data td.r { text-align: left; direction: ltr; white-space: nowrap; font-variant-numeric: tabular-nums; }
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
    : `<p class="none">لا يوجد ما يمكن تصديره.</p>`}
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
