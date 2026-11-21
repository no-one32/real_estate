import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { listComplexIdsForUser } from "@/lib/members";

/**
 * Dashboard assistant: answers a client's questions about their own projects.
 * The server builds a small summary of the client's data and sends it to Groq
 * (OpenAI-compatible chat API) with the conversation. The key stays server side.
 *
 * .env.local:  GROQ_API_KEY=gsk_...   (optional: GROQ_MODEL=...)
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const MAX_TURNS = 12;
const MAX_CHARS = 1500;
const RECENT_LEADS = 12;
const DAY = 864e5;

type ChatMsg = { role: "user" | "assistant"; content: string };

const iso = (d: number) => new Date(d).toISOString();
const day = (s: string) => s.slice(0, 10);

function tally(items: (string | null | undefined)[], top = 8) {
  const m = new Map<string, number>();
  for (const k of items) {
    const key = k || "unknown";
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top));
}

/** Rows or [] — a missing table or column (migration not run yet) must not break the assistant. */
async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await q;
    return !error && Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

/** Supabase gives at most 1000 rows per request: page through (same as the Analytics page). */
async function allRows<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, cap = 30000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    try {
      const { data, error } = await make(from, from + 999);
      if (error || !Array.isArray(data)) return out;
      out.push(...(data as T[]));
      if (data.length < 1000) return out;
    } catch {
      return out;
    }
  }
  return out;
}

/** Compact snapshot of one project. Contact details (email, phone) are left out on purpose. */
async function snapshot(sb: SupabaseClient, c: { id: string; name: string; city?: string | null }) {
  const now = Date.now();
  const since30 = iso(now - 30 * DAY);
  const since7 = now - 7 * DAY;

  const [units, leads, visits, events, qrs] = await Promise.all([
    rows<{ display_id: string; model: string | null; type: number; status: string; price: number; rooms: number; surface: number }>(
      sb.from("units").select("display_id, model, type, status, price, rooms, surface").eq("complex_id", c.id),
    ),
    rows<{ prenom: string; nom: string; unit_display_id: string | null; favorite_units: string[] | null; status: string | null; subject: string | null; created_at: string }>(
      sb.from("leads").select("prenom, nom, unit_display_id, favorite_units, status, subject, created_at").eq("complex_id", c.id).order("created_at", { ascending: false }).limit(500),
    ),
    allRows<{ visitor_id: string; created_at: string; source: string | null; device: string | null; country: string | null; qr_id: string | null }>((a, b) =>
      sb.from("complex_visits").select("visitor_id, created_at, source, device, country, qr_id").eq("complex_id", c.id).gte("created_at", since30).order("created_at", { ascending: false }).range(a, b),
    ),
    // all time (not only 30 days): needed for "least viewed" and for villas never opened
    allRows<{ unit_display_id: string; kind: string; created_at: string }>((a, b) =>
      sb.from("unit_events").select("unit_display_id, kind, created_at").eq("complex_id", c.id).order("created_at", { ascending: false }).range(a, b),
    ),
    rows<{ id: string; label: string | null; created_at: string }>(sb.from("qr_codes").select("id, label, created_at").eq("complex_id", c.id)),
  ]);

  const prices = units.map((u) => u.price).filter((p) => p > 0);
  const since30ms = now - 30 * DAY;
  const events30 = events.filter((e) => Date.parse(e.created_at) >= since30ms);

  /** every villa of the project with its count (0 included), fewest first: answers "least viewed / never viewed" */
  const perVilla = (list: typeof events, kind: string) => {
    const n = new Map<string, number>(units.map((u) => [u.display_id, 0]));
    for (const e of list) if (e.kind === kind && e.unit_display_id) n.set(e.unit_display_id, (n.get(e.unit_display_id) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], undefined, { numeric: true }));
  };
  const views30 = perVilla(events30, "view");
  const viewsAll = perVilla(events, "view");
  const compact = (l: [string, number][]) => l.map(([id, k]) => `${id}:${k}`).join(", ");
  const byQr = tally(visits.map((v) => v.qr_id).filter(Boolean), 50);
  const leadName = (l: (typeof leads)[number]) =>
    [l.prenom?.trim(), (l.nom || "").replace(/^(السيد|السيدة|لا)\s+/, "").trim()].filter(Boolean).join(" ") || "Unnamed";

  return {
    project: c.name,
    city: c.city ?? undefined,
    villas: {
      total: units.length,
      byStatus: tally(units.map((u) => u.status)),
      byModel: tally(units.map((u) => u.model || `type ${u.type}`), 12),
      priceSAR: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
      // short form "villa model/bedrooms/m²/SAR" keeps the prompt small (the AI service counts text per minute)
      availableFormat: "villa model/bedrooms/m2/priceSAR",
      available: units
        .filter((u) => u.status === "available")
        .slice(0, 60)
        .map((u) => `${u.display_id} ${u.model || `T${u.type}`}/${u.rooms}/${u.surface}/${u.price}`)
        .join(", "),
    },
    visitsLast30Days: {
      visits: visits.length,
      uniqueVisitors: new Set(visits.map((v) => v.visitor_id)).size,
      visitsLast7Days: visits.filter((v) => new Date(v.created_at).getTime() >= since7).length,
      bySource: tally(visits.map((v) => v.source)),
      byDevice: tally(visits.map((v) => v.device)),
      byCountry: tally(visits.map((v) => v.country)),
    },
    villaInterestLast30Days: {
      mostViewed: Object.fromEntries([...views30].reverse().slice(0, 10)),
      leastViewed: Object.fromEntries(views30.slice(0, 10)),
      neverViewed: views30.filter(([, k]) => k === 0).length,
      mostFavorited: tally(events30.filter((e) => e.kind === "favorite").map((e) => e.unit_display_id), 5),
    },
    villaInterestAllTime: {
      totalViews: events.filter((e) => e.kind === "view").length,
      mostViewed: Object.fromEntries([...viewsAll].reverse().slice(0, 10)),
      leastViewed: Object.fromEntries(viewsAll.slice(0, 10)),
      neverViewed: viewsAll.filter(([, k]) => k === 0).length,
    },
    /** "villa:views" for EVERY villa, fewest first (30 days only: keeps the prompt small for the AI service's per-minute limit) */
    viewsPerVillaLast30Days: compact(views30),
    qrCodes: qrs.map((q, i) => ({ name: q.label || `QR${qrs.length - i}`, created: day(q.created_at), visitsLast30Days: byQr[q.id] ?? 0 })),
    contacts: {
      total: leads.length,
      last7Days: leads.filter((l) => new Date(l.created_at).getTime() >= since7).length,
      byStatus: tally(leads.map((l) => l.status || "new")),
      mostRequestedVillas: tally(leads.map((l) => l.unit_display_id).filter(Boolean), 5),
      recent: leads.slice(0, RECENT_LEADS).map((l) => ({
        name: leadName(l),
        date: day(l.created_at),
        villa: l.unit_display_id || undefined,
        favorites: l.favorite_units?.filter(Boolean).length ? l.favorite_units.filter(Boolean) : undefined,
        status: l.status || "new",
        subject: l.subject || undefined,
      })),
    },
  };
}

function systemPrompt(data: unknown, clientName: string) {
  return [
    "You are the assistant inside the AXIS Studio client dashboard, used by real-estate developers to follow their villa projects.",
    `You are talking to ${clientName}. Today is ${day(new Date().toISOString())}.`,
    "Answer questions about their projects using ONLY the JSON data below. If the data does not contain the answer, say so plainly and, when useful, say which dashboard page to check. The dashboard is in Arabic; use these page names: مشاريعي (projects), الإحصائيات (analytics), العملاء (contacts), الوحدات (apartments), رمز QR, مركز المساعدة (help).",
    "Never invent numbers, names or villas. Prices are in Saudi riyals (SAR).",
    "Never mention the names of the data fields (like villaInterestAllTime or leastViewed) or say \"JSON\": speak naturally, e.g. \"according to your statistics\". When you list villas by views, give the number of views next to each villa.",
    "Reply in the language of the user's last message (Arabic, French or English); when unsure, reply in Arabic. Write numbers with Western digits (0-9). Keep answers short and clear; use a short list when you give several items.",
    "Contact statuses: new = new lead, in_progress = being followed up, sold = closed.",
    "Villa views: villaInterestLast30Days / villaInterestAllTime give the most and least viewed villas; viewsPerVillaLast30Days lists every villa as \"villa:views\" (fewest first, 0 = never opened). Use them for any question about the most, least or never viewed villas, or the views of one villa. Say which period you used (last 30 days unless the user asks otherwise); if several villas share the lowest count, say how many and list a few.",
    "Statuses of villas: available = متاحة, reserved = محجوزة, sold = مباعة.",
    "",
    "DATA:",
    JSON.stringify(data),
  ].join("\n");
}

export async function POST(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return auth.response;

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.error("assistant: GROQ_API_KEY is missing");
    return NextResponse.json({ error: "The assistant is not available right now. Please try again later." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const history: ChatMsg[] = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m: ChatMsg) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m: ChatMsg) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }

  const service = createServiceSupabase() ?? auth.supabase;
  const ids = await listComplexIdsForUser(service, auth.user.id);
  const complexes = ids.length
    ? await rows<{ id: string; name: string; city: string | null }>(service.from("complexes").select("*").in("id", ids))
    : [];
  const data = { projects: await Promise.all(complexes.map((c) => snapshot(service, c))) };
  const clientName = auth.profile?.full_name || "the client";

  const ask = () =>
    fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 700,
        reasoning_effort: "low",
        include_reasoning: false,
        messages: [{ role: "system", content: systemPrompt(data, clientName) }, ...history],
      }),
    });
  let res: Response;
  try {
    res = await ask();
    // the AI service limits text per minute: when it says "wait a few seconds", wait once and ask again
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 0;
      if (wait > 0 && wait <= 30) {
        await new Promise((r) => setTimeout(r, wait * 1000 + 300));
        res = await ask();
      }
    }
  } catch {
    return NextResponse.json({ error: "Could not reach the assistant service. Try again." }, { status: 502 });
  }

  if (res.status === 429) {
    return NextResponse.json({ error: "Too many questions in a short time. Wait a minute and try again." }, { status: 429 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("groq error", res.status, detail.slice(0, 500));
    return NextResponse.json({ error: "The assistant could not answer right now." }, { status: 502 });
  }

  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const answer = json?.choices?.[0]?.message?.content?.trim();
  if (!answer) return NextResponse.json({ error: "The assistant returned an empty answer." }, { status: 502 });
  return NextResponse.json({ answer });
}
