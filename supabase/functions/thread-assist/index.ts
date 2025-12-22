import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SuggestionTone = "friendly" | "concise" | "professional" | "assertive";

type Payload = {
  thread_id: string;
  user_id: string;
  campaign_id?: string;
  tone?: SuggestionTone;
  suggestions?: number;
};

type AssistOutput = {
  summary: string;
  entities: Record<string, unknown>;
  suggestions: Array<{ tone?: string; subject?: string; body?: string }>;
  actions: Array<{ key: string; label: string; meta?: Record<string, unknown> }>;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const TEN_SECONDS_MS = 10_000;
const DEFAULT_TONE: SuggestionTone = "friendly";
const DEFAULT_SUGGESTIONS = 3;

async function getAssistPrefs(userId: string) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("assist_prefs")
    .select("default_tone, max_suggestions")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("assist_prefs lookup failed", error);
    return null;
  }
  return data;
}

async function getRecentLog(threadId: string) {
  const { data, error } = await supabase
    .from("thread_assist_logs")
    .select("created_at, summary, entities, suggestions, n_actions")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("thread_assist_logs lookup failed", error);
    return null;
  }
  return data;
}

async function getThreadContext(threadId: string) {
  const [{ data: msgs }, { data: thread }, { data: lead }, { data: campaign }] = await Promise.all([
    supabase
      .from("inbox_messages")
      .select("id, direction, subject, text_body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(40),
    supabase.from("inbox_threads").select("id, lead_id, campaign_id").eq("id", threadId).maybeSingle(),
    supabase.from("leads").select("first_name, last_name, company, email, meta").eq("id", thread?.lead_id ?? "").maybeSingle(),
    supabase.from("campaigns").select("name").eq("id", thread?.campaign_id ?? "").maybeSingle()
  ]);

  return {
    messages: msgs ?? [],
    lead: lead ?? null,
    campaign: campaign ?? null
  };
}

function expandTokens(text: string, lead: Record<string, unknown> | null) {
  const map: Record<string, string> = {
    first_name: typeof lead?.["first_name"] === "string" ? (lead["first_name"] as string) : "",
    last_name: typeof lead?.["last_name"] === "string" ? (lead["last_name"] as string) : "",
    company: typeof lead?.["company"] === "string" ? (lead["company"] as string) : "",
    email: typeof lead?.["email"] === "string" ? (lead["email"] as string) : ""
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? "");
}

async function callLLM(system: string, user: string) {
  const endpoint = Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1/chat/completions";
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: Deno.env.get("ASSIST_MODEL") ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`LLM call failed: ${response.status} ${message}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content || "";
}

function normalizeOutput(raw: AssistOutput | null | undefined, desiredSuggestions: number, lead: Record<string, unknown> | null) {
  const base: AssistOutput = {
    summary: raw?.summary ?? "",
    entities: (raw?.entities && typeof raw.entities === "object") ? raw.entities : {},
    suggestions: Array.isArray(raw?.suggestions) ? raw!.suggestions : [],
    actions: Array.isArray(raw?.actions) ? raw!.actions : []
  };

  return {
    summary: base.summary,
    entities: base.entities,
    suggestions: base.suggestions.slice(0, desiredSuggestions).map((suggestion) => ({
      ...suggestion,
      subject: expandTokens(suggestion.subject ?? "", lead),
      body: expandTokens(suggestion.body ?? "", lead)
    })),
    actions: base.actions
  };
}

function buildTranscript(messages: Array<Record<string, unknown>>) {
  return (messages ?? [])
    .map((message) => {
      const direction = message["direction"] ?? "";
      const subject = message["subject"] ? `SUBJECT: ${message["subject"]}\n` : "";
      const body = message["text_body"] ?? "";
      return `[${direction}] ${subject}${body}`;
    })
    .join("\n---\n");
}

function buildPrompts({ tone, suggestions }: { tone: string; suggestions: number }, lead: any, campaign: any, transcript: string) {
  const system = `You are Thread Assist for a cold email CRM. Summarize threads, extract entities, propose ${suggestions} short email replies in the requested tone, keep subjects under 70 chars, bodies under 120 words, and include ONE clear CTA. Also propose up to 3 "Next Best Actions" keys among: OFFER_TIMES, ROUTE, CLOSE, CREATE_TASK, SEND_NUDGE. JSON only.`;
  const user = `Tone: ${tone}
Lead: ${lead?.first_name ?? ""} ${lead?.last_name ?? ""} @ ${lead?.company ?? ""} <${lead?.email ?? ""}>
Campaign: ${campaign?.name ?? ""}
Thread transcript:
${transcript}

Return JSON with:
{
 "summary":"...",
 "entities":{"people":[...],"company":"...","ask":"...","dates":[...],"links":[...]},
 "suggestions":[{"tone":"${tone}","subject":"...","body":"..."} ... ${suggestions} ],
 "actions":[{"key":"OFFER_TIMES","label":"Offer 3 time slots"},{"key":"SEND_NUDGE","label":"Bump"}]
}`;

  return { system, user };
}

async function logAssistRun(threadId: string, payload: AssistOutput) {
  const model = Deno.env.get("ASSIST_MODEL") ?? "gpt-4o-mini";
  const { error } = await supabase.from("thread_assist_logs").insert({
    thread_id: threadId,
    model,
    summary: payload.summary,
    entities: payload.entities,
    suggestions: payload.suggestions,
    n_actions: payload.actions
  });
  if (error) {
    console.error("Failed to log assist run", error);
  }
}

function respond(data: AssistOutput, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const payload = (await req.json()) as Payload;
    if (!payload?.thread_id || !payload?.user_id) {
      return new Response("Missing required fields", { status: 400 });
    }

    const prefs = await getAssistPrefs(payload.user_id);
    const derivedTone = (payload.tone ?? prefs?.default_tone ?? DEFAULT_TONE) as SuggestionTone;
    const maxSuggestions = prefs?.max_suggestions ?? DEFAULT_SUGGESTIONS;
    const requestedSuggestions = payload.suggestions ?? maxSuggestions;
    const suggestionCount = Math.max(1, Math.min(requestedSuggestions, maxSuggestions));

    const recent = await getRecentLog(payload.thread_id);
    if (recent) {
      const recentTs = new Date(recent.created_at).getTime();
      if (!Number.isNaN(recentTs) && Date.now() - recentTs < TEN_SECONDS_MS) {
        const cached = normalizeOutput(
          {
            summary: recent.summary ?? "",
            entities: (recent.entities as AssistOutput["entities"]) ?? {},
            suggestions: (recent.suggestions as AssistOutput["suggestions"]) ?? [],
            actions: (recent.n_actions as AssistOutput["actions"]) ?? []
          },
          suggestionCount,
          null
        );
        return respond(cached);
      }
    }

    const { messages, lead, campaign } = await getThreadContext(payload.thread_id);
    const transcript = buildTranscript(messages);
    const prompts = buildPrompts({ tone: derivedTone, suggestions: suggestionCount }, lead, campaign, transcript);

    let parsed: AssistOutput = { summary: "", entities: {}, suggestions: [], actions: [] };
    try {
      const llmRaw = await callLLM(prompts.system, prompts.user);
      parsed = normalizeOutput(JSON.parse(llmRaw), suggestionCount, lead);
    } catch (error) {
      console.error("LLM parsing failed", error);
      parsed = normalizeOutput(null, suggestionCount, lead);
    }

    await logAssistRun(payload.thread_id, parsed);
    return respond(parsed);
  } catch (error) {
    console.error("thread-assist error", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});






