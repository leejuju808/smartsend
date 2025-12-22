import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
const CALENDAR_LINK = Deno.env.get("CALENDAR_LINK") ?? "https://cal.com/you/intro";
const PRICING_URL = Deno.env.get("PRICING_URL") ?? "https://smartsendhq.com/pricing";
const START_PRICE = Deno.env.get("START_PRICE") ?? "99";

function svc() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key);
}

const SYS = `You write short, friendly B2B cold email replies.

Constraints:
- Keep to 60–120 words.
- 1 clear CTA.
- Keep subject if thread already has one (return empty subject to reuse).
- Output JSON array of suggestions. Each item: {source:"ai", subject:"", body_html:"<p>…</p>"}.

Tone: concise, helpful, no fluff.`;

function fillTemplate(html: string) {
  return html
    .replaceAll("{{CALENDAR_LINK}}", CALENDAR_LINK)
    .replaceAll("{{PRICING_URL}}", PRICING_URL)
    .replaceAll("{{START_PRICE}}", START_PRICE);
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = svc();
  let payload: { thread_id?: string };

  try {
    payload = await req.json();
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid json" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const threadId = payload.thread_id;
  if (!threadId) {
    return new Response(
      JSON.stringify({ ok: false, error: "thread_id required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: thread, error: terr } = await supabase
    .from("inbox_threads")
    .select("id, subject")
    .eq("id", threadId)
    .single();

  if (terr || !thread) {
    return new Response(
      JSON.stringify({ ok: false, error: "thread not found" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: inbound } = await supabase
    .from("inbox_messages")
    .select("id, direction, text, html, ai_label")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const label = inbound?.ai_label ?? "neutral";
  const body = inbound?.text || inbound?.html || "";

  const cats = label === "positive"
    ? ["calendar", "pricing"]
    : label === "question"
    ? ["intro", "pricing", "calendar"]
    : ["intro"];

  const { data: templates } = await supabase
    .from("reply_templates")
    .select("id, name, category, subject, body_html")
    .in("category", cats)
    .eq("enabled", true)
    .limit(5);

  const templated = (templates ?? []).map((tpl) => ({
    source: "template" as const,
    subject: tpl.subject ?? "",
    body_html: fillTemplate(tpl.body_html),
    name: tpl.name,
    category: tpl.category,
  }));

  const aiKey = Deno.env.get("OPENAI_API_KEY");
  let aiSugs: Array<{ source: "ai"; subject: string; body_html: string }> = [];

  if (aiKey && body) {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYS },
          {
            role: "user",
            content: `Latest inbound (label=${label}):\n${body}\nThread subject: ${thread.subject ?? ""}`,
          },
        ],
      }),
    });

    if (res.ok) {
      const json = await res.json();
      try {
        const content = json.choices?.[0]?.message?.content ?? '{"suggestions": []}';
        const parsed = JSON.parse(content);
        const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
        aiSugs = suggestions
          .map((s: any) => ({
            source: "ai" as const,
            subject: typeof s.subject === "string" ? s.subject : "",
            body_html: typeof s.body_html === "string" ? s.body_html : "",
          }))
          .filter((s) => s.body_html)
          .slice(0, 2);
      } catch (_err) {
        aiSugs = [];
      }
    }
  }

  const suggestions = [...templated, ...aiSugs].slice(0, 5);

  return new Response(
    JSON.stringify({ ok: true, suggestions }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});


