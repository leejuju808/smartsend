// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;

type ParseOut = {
  intent: "schedule" | "reschedule" | "decline" | "none";
  lead_tz?: string | null;
  mentions?: Array<{ when_text: string; iso?: string | null }>;
  note?: string | null;
  confidence: number;
};

function stripHtml(html?: string) {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function parseMeeting(text: string, fallbackTz?: string): Promise<ParseOut> {
  const sys = `You extract meeting intents and normalize any date/time references to ISO-8601 UTC instants when possible.\nIf a time reference lacks a date, assume the next occurrence in the future based on the author's timezone if provided.\nReturn JSON with fields: intent, lead_tz (IANA or null), mentions[{when_text, iso|null}], note, confidence (0..1).`;
  const user = `TZ (optional): ${fallbackTz ?? "unknown"}\nEmail text:\n"""${text.slice(0, 6000)}"""`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) throw new Error(await resp.text());
  const j = await resp.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as ParseOut;
  if (!parsed.intent) parsed.intent = "none";
  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.6));
  return parsed;
}

Deno.serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const url = new URL(req.url);
    const threadId = url.searchParams.get("thread_id");
    if (!threadId) return new Response("Missing thread_id", { status: 400 });

    const { data: row, error } = await sb
      .from("v_thread_last_inbound_labeled")
      .select("thread_id,campaign_id,lead_id,last_msg_id,last_label,last_plain,last_html")
      .eq("thread_id", threadId)
      .maybeSingle();
    if (error) throw error;
    if (!row?.last_msg_id)
      return new Response(JSON.stringify({ ok: true, skipped: "no inbound" }), {
        headers: { "content-type": "application/json" },
      });

    const { data: camp } = await sb
      .from("campaigns")
      .select("meet_my_tz, meet_duration_min")
      .eq("id", row.campaign_id)
      .maybeSingle();
    const { data: lead } = await sb.from("leads").select("tz, country").eq("id", row.lead_id).maybeSingle();

    const text = row.last_plain && row.last_plain.trim().length > 0 ? row.last_plain : stripHtml(row.last_html);
    const parsed = await parseMeeting(text, lead?.tz ?? camp?.meet_my_tz ?? undefined);

    if (parsed.intent === "none" || (parsed.mentions ?? []).length === 0) {
      await sb.from("meeting_intents").delete().eq("thread_id", row.thread_id);
      return new Response(JSON.stringify({ ok: true, intent: "none" }), {
        headers: { "content-type": "application/json" },
      });
    }

    const cIso = (parsed.mentions ?? []).map((m) => m.iso ?? null).filter(Boolean) as string[];
    const cLocal = (parsed.mentions ?? []).map((m) => m.when_text);

    await sb.from("meeting_intents").upsert({
      thread_id: row.thread_id,
      campaign_id: row.campaign_id,
      lead_id: row.lead_id,
      detected_at: new Date().toISOString(),
      source_message_id: row.last_msg_id,
      lead_tz: parsed.lead_tz ?? lead?.tz ?? null,
      my_tz: camp?.meet_my_tz ?? null,
      candidate_iso: cIso,
      candidate_local: cLocal,
      note: parsed.note ?? null,
      confidence: parsed.confidence ?? 0.7,
    });

    return new Response(
      JSON.stringify({ ok: true, intent: parsed.intent, candidates: cIso.length }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});



