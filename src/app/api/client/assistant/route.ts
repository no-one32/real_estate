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
const RECENT_LEADS = 25;
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
    rows<{ visitor_id: string; created_at: string; source: string | null; device: string | null; country: string | null; qr_id: string | null }>(
      sb.from("complex_visits").select("visitor_id, created_at, source, device, country, qr_id").eq("complex_id", c.id).gte("created_at", since30).limit(5000),
    ),
    rows<{ unit_display_id: string; kind: string }>(
      sb.from("unit_events").select("unit_display_id, kind").eq("complex_id", c.id).gte("created_at", since30).limit(5000),
    ),
    rows<{ id: string; label: string | null; created_at: string }>(sb.from("qr_codes").select("id, label, created_at").eq("complex_id", c.id)),
  ]);

  const prices = units.map((u) => u.price).filter((p) => p > 0);
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
      available: units
        .filter((u) => u.status === "available")
        .slice(0, 60)
        .map((u) => `${u.display_id} (${u.model || `type ${u.type}`}, ${u.rooms} bd, ${u.surface} m², SAR ${u.price})`),
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
      mostViewed: tally(events.filter((e) => e.kind === "view").map((e) => e.unit_display_id), 5),
      mostFavorited: tally(events.filter((e) => e.kind === "favorite").map((e) => e.unit_display_id), 5),
    },
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
    "Answer questions about their projects using ONLY the JSON data below. If the data does not contain the answer, say so plainly and, when useful, say which dashboard page to check (Projects, Analytics, Contacts, Apartments, QR Code, Help Center).",
    "Never invent numbers, names or villas. Prices are in Saudi riyals (SAR).",
    "Reply in the language of the user's last message (Arabic, French or English). Keep answers short and clear; use a short list when you give several items.",
    "Contact statuses: new = new lead, in_progress = being followed up, sold = closed.",
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

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 900,
        reasoning_effort: "low",
        include_reasoning: false,
        messages: [{ role: "system", content: systemPrompt(data, clientName) }, ...history],
      }),
    });
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
