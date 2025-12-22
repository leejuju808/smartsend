import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.61.0";

type VariantRow = {
  subject?: string | null;
  body?: string | null;
  tone?: string | null;
  weight?: number | null;
};

type ThreadContext = {
  thread_id: string;
  campaign_id: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  inbound_text?: string | null;
  tz?: string | null;
  duration_min?: number | null;
  start_hour?: number | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY =
  Deno.env.get("OPENAI_API_KEY") ??
  Deno.env.get("OPENAI_KEY") ??
  Deno.env.get("OPENAI_SECRET");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

function pickWeighted<T extends { weight?: number | null }>(rows: T[]): T | null {
  if (!rows?.length) return null;
  const norm = rows.map((row) => Math.max(0.0001, Number(row.weight ?? 1)));
  const total = norm.reduce((sum, w) => sum + w, 0);
  let target = Math.random() * total;

  for (let i = 0; i < rows.length; i += 1) {
    target -= norm[i];
    if (target <= 0) {
      return rows[i];
    }
  }

  return rows[rows.length - 1];
}

async function composeFallback(ctx: ThreadContext): Promise<{ subject: string; body: string }> {
  const subject = "Quick follow-up";

  if (!openai) {
    const greeting = ctx.first_name ? `Hi ${ctx.first_name},` : "Hi there,";
    const closing = "Happy to follow your lead.";
    const body = [
      greeting,
      "",
      "Just circling back on my last note and wanted to see if a quick chat might still be helpful.",
      "If you're open to it, I can make time later this week or keep things async over email—whatever works best.",
      "",
      closing,
    ].join("\n");
    return { subject, body };
  }

  const tz = ctx.tz || "America/Los_Angeles";
  const startHour = Number.isFinite(ctx.start_hour) ? Number(ctx.start_hour) : 10;
  const duration = Number.isFinite(ctx.duration_min) ? Number(ctx.duration_min) : 30;
  const prompt = `
Write a short, friendly follow-up to a neutral reply.

Constraints:
- 70–110 words, 1–2 short paragraphs.
- Acknowledge their note without pressure.
- Offer 1 clear next step (quick call or quick answer by email).
- Provide 2 time options (${tz}) at ${startHour}:00 and ${startHour + 2}:00, ${duration} min.
- Close with "happy to follow your lead."

Return JSON: {"subject":"<under 7 words>","body":"..."}.

Lead: ${ctx.first_name ?? ""} ${ctx.last_name ?? ""} at ${ctx.company ?? ""}
Their last note: """${ctx.inbound_text ?? ""}"""
`.trim();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices?.[0]?.message?.content?.trim() ?? "";

  try {
    const parsed = JSON.parse(raw);
    return {
      subject: typeof parsed.subject === "string" && parsed.subject.length > 0 ? parsed.subject : subject,
      body: typeof parsed.body === "string" && parsed.body.length > 0 ? parsed.body : raw,
    };
  } catch {
    return { subject, body: raw || "Following up—happy to follow your lead." };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const threadId = String(payload?.thread_id ?? "");
  if (!threadId) {
    return new Response("thread_id required", { status: 400 });
  }

  const { data: canNudge, error: gateError } = await supabase.rpc("can_nudge_thread", {
    p_thread: threadId,
  });

  if (gateError) {
    console.error("can_nudge_thread error", gateError);
    return new Response("Throttle check failed", { status: 500 });
  }

  if (canNudge === false) {
    return new Response(JSON.stringify({ ok: false, throttled: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: ctx, error: ctxErr } = await supabase
    .from("v_thread_context")
    .select("thread_id,campaign_id,first_name,last_name,company,inbound_text,tz,duration_min,start_hour")
    .eq("thread_id", threadId)
    .maybeSingle();

  if (ctxErr || !ctx) {
    return new Response("context not found", { status: 404 });
  }

  let subject = "Quick follow-up";
  let body: string | null = null;

  const { data: variants, error: variantError } = await supabase
    .from("nudge_variants")
    .select("subject,body,tone,weight")
    .eq("campaign_id", ctx.campaign_id)
    .eq("scenario", "neutral")
    .eq("is_active", true);

  if (variantError) {
    console.error("Variant fetch failed", variantError);
  } else if (variants && variants.length > 0) {
    const chosen = pickWeighted<VariantRow>(variants);
    if (chosen) {
      subject = chosen.subject?.trim() || subject;
      body = (chosen.body || "")
        .replace(/\{\{first_name\}\}/g, ctx.first_name ?? "")
        .replace(/\{\{company\}\}/g, ctx.company ?? "");
    }
  }

  if (!body) {
    const fallback = await composeFallback(ctx as ThreadContext);
    subject = fallback.subject;
    body = fallback.body;
  }

  const { data: taskId, error: taskErr } = await supabase.rpc("ensure_nudge_task", {
    p_thread: threadId,
    p_campaign: ctx.campaign_id,
  });

  if (taskErr) {
    console.error("ensure_nudge_task error", taskErr);
    return new Response("ensure task failed", { status: 500 });
  }

  if (!taskId) {
    return new Response("task not created", { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("followup_tasks")
    .update({ suggested_reply: body })
    .eq("id", taskId);

  if (updateErr) {
    console.error("followup_tasks update failed", updateErr);
    return new Response("failed to attach draft", { status: 500 });
  }

  const { error: logErr } = await supabase.from("followup_nudges").insert({
    campaign_id: ctx.campaign_id,
    thread_id: threadId,
    kind: "neutral_nudge",
    note: "drafted",
  });

  if (logErr) {
    console.error("followup_nudges insert failed", logErr);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      task_id: taskId,
      subject,
      body,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});








