import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing required Supabase environment variables");
  throw new Error("Missing Supabase environment variables");
}

if (!OPENAI_KEY) {
  console.error("Missing OPENAI_API_KEY");
  throw new Error("Missing OPENAI_API_KEY");
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type PromptVariant = "short" | "value" | "question" | "breakup" | "soft-CTA" | string;

interface SuggestionContext {
  lead?: {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    email?: string | null;
  } | null;
  label?: string | null;
  subject: string;
  body: string;
}

Deno.serve(async (req) => {
  try {
    const { thread_id, variants = ["short", "value", "question"] } = await req
      .json()
      .catch(() => ({})) as { thread_id?: string; variants?: PromptVariant[] };

    if (!thread_id) {
      return jsonResponse({ error: "Missing thread_id" }, 400);
    }

    const { data: thread, error: threadError } = await sb
      .from("reply_threads")
      .select(
        "id, account_id, lead:leads(first_name,last_name,company,email,timezone), last_label"
      )
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return jsonResponse({ error: "Thread not found" }, 404);
    }

    const { data: latest } = await sb
      .from("inbound_messages")
      .select("subject,text_body,html_body,received_at")
      .eq("thread_id", thread_id)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const context: SuggestionContext = {
      lead: thread.lead,
      label: thread.last_label || "neutral",
      subject: latest?.subject || "",
      body: truncateBody(latest?.text_body || latest?.html_body || "", 4000),
    };

    const prompts = variants.map((variant) => ({
      variant,
      prompt: suggestionPrompt(context, variant),
    }));

    const outs = [];
    for (const entry of prompts) {
      const completion = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt() },
            { role: "user", content: entry.prompt },
          ],
          temperature: 0.4,
        }),
      });

      if (!completion.ok) {
        const errBody = await completion.text();
        console.error("OpenAI error", completion.status, errBody);
        continue;
      }

      const completionJson = await completion.json();
      const html = (completionJson.choices?.[0]?.message?.content || "").trim();
      if (!html) continue;
      outs.push({ variant: entry.variant, html });
    }

    if (!outs.length) {
      return jsonResponse({ error: "No suggestions generated" }, 502);
    }

    const rows = outs.map((out) => ({
      account_id: thread.account_id,
      thread_id,
      label: thread.last_label,
      variant: out.variant,
      subject: buildReplySubject(context.subject),
      html_body: out.html,
      tokens: 0,
      meta: {},
    }));

    const { error: insertError } = await sb.from("reply_suggestions").insert(rows);
    if (insertError) {
      console.error("Failed inserting suggestions", insertError);
      return jsonResponse({ error: "Failed to persist suggestions" }, 500);
    }

    return jsonResponse({ created: rows.length });
  } catch (err) {
    console.error("Unhandled error in reply-suggest", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

function truncateBody(input: string, max: number) {
  return input.length > max ? input.slice(0, max) : input;
}

function buildReplySubject(subject: string) {
  if (!subject) return "";
  return subject.startsWith("Re:") || subject.startsWith("RE:")
    ? subject
    : `Re: ${subject}`;
}

function systemPrompt() {
  return "You write short, respectful B2B email replies. Keep to 3–6 sentences, plain HTML (<p>, <strong>, <ul>), 1 clear CTA, avoid spammy phrasing, honor unsubscribe if asked.";
}

function suggestionPrompt(ctx: SuggestionContext, variant: PromptVariant) {
  const name = ctx.lead?.first_name || "there";
  const company = ctx.lead?.company || "";
  const base = [
    "Latest inbound summary:",
    `Subject: ${ctx.subject}`,
    `Body: ${ctx.body}`,
    "",
    `Lead: ${name} at ${company}`,
    `Detected intent: ${ctx.label}`,
    "",
    `Write a ${variant} reply that continues this thread.`,
    "Use <p> paragraphs, 1-line CTA, no images, no tracking links.",
  ].join("\n");

  switch (variant) {
    case "short":
      return `${base}\nTone: concise, friendly.\nCTA: propose one quick next step.`;
    case "value":
      return `${base}\nTone: helpful, value-forward.\nAdd 2 bullet points of value before CTA.`;
    case "question":
      return `${base}\nTone: curious.\nAsk one clarifying question + suggest a 15-min slot.`;
    case "breakup":
      return `${base}\nTone: polite final nudge.\nOffer to close the loop if not relevant.`;
    case "soft-CTA":
      return `${base}\nTone: low-friction.\nCTA should be a 1-click choice (Yes/No style).`;
    default:
      return base;
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: HeadersInit = { "content-type": "application/json" }
) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}


