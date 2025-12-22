// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";
import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY =
  Deno.env.get("OPENAI_KEY") ?? Deno.env.get("OPENAI_API_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase credentials are not configured");
}

if (!OPENAI_KEY) {
  throw new Error("OPENAI_KEY (or OPENAI_API_KEY) must be configured");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: OPENAI_KEY });

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const threadId = payload?.thread_id ?? payload?.threadId;
  if (!threadId || typeof threadId !== "string") {
    return new Response("thread_id required", { status: 400 });
  }

  const { data: ctx, error: ctxErr } = await supabase
    .from("v_thread_context")
    .select("thread_id,campaign_id,lead_id,first_name,last_name,company,inbound_text")
    .eq("thread_id", threadId)
    .maybeSingle();

  if (ctxErr || !ctx) {
    console.error("draft-close-loop: context missing", ctxErr);
    return new Response("context not found", { status: 404 });
  }

  const prompt = `
Write a very short, respectful email to close the loop after a negative response.
Constraints:
- 60-90 words, max 3 sentences.
- Thank them, acknowledge the decision, promise no further emails.
- Offer a future door-open line ("If priorities change...").
Return JSON: {"subject":"...", "body":"..."}.
Lead: ${ctx.first_name ?? ""} ${ctx.last_name ?? ""} at ${ctx.company ?? ""}
Their last note (for tone only): """${ctx.inbound_text ?? ""}"""
`;

  const ai = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  let subject = "Understood — closing the loop";
  let body = ai.choices[0]?.message?.content?.trim() ?? "";

  try {
    const parsed = JSON.parse(body);
    subject = parsed.subject ?? subject;
    body = parsed.body ?? body;
  } catch {
    // Ignore parse failures; fall back to raw content.
  }

  let taskId: string | null = null;
  const nowIso = new Date().toISOString();

  const baseInsert: Record<string, any> = {
    campaign_id: ctx.campaign_id,
    thread_id: threadId,
    kind: "close",
    status: "open",
    suggested_reply: body,
    note: "auto-created on negative",
  };

  if (ctx.lead_id) {
    baseInsert.lead_id = ctx.lead_id;
  }

  let { data: insertData, error: insertErr } = await supabase
    .from("followup_tasks")
    .insert(baseInsert)
    .select("id")
    .maybeSingle();

  if (insertErr || !insertData) {
    console.warn("draft-close-loop: followup_tasks insert fallback", insertErr);
    const fallback: Record<string, any> = {
      campaign_id: ctx.campaign_id,
      thread_id: threadId,
      status: "new",
      reason: "close_negative",
      draft_subject: subject,
      draft_body: body,
      auto_send: false,
      kind: "close",
      note: "auto-created on negative",
      suggested_reply: body,
      due_at: nowIso,
      nudge_num: 0,
    };

    if (ctx.lead_id) {
      fallback.lead_id = ctx.lead_id;
    }

    const second = await supabase
      .from("followup_tasks")
      .insert(fallback)
      .select("id")
      .maybeSingle();

    insertData = second.data ?? null;
    insertErr = second.error ?? null;
  }

  if (insertErr) {
    console.error("draft-close-loop: followup_tasks insert failed", insertErr);
  } else if (insertData?.id) {
    taskId = insertData.id as string;
  }

  const responsePayload = {
    ok: true,
    task_id: taskId,
    subject,
    body,
  };

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(handler);







