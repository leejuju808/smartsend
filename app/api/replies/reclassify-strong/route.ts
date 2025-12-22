import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  const { thread_id }: { thread_id?: string } = await req.json();

  if (!thread_id) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabaseUser = createServerClient();
  const { data: me, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !me.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: msg, error: fetchError } = await supabase
    .from("inbox_messages")
    .select("body_text")
    .eq("thread_id", thread_id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !msg) {
    return NextResponse.json({ error: "no_inbound" }, { status: 400 });
  }

  const client = new OpenAI();
  const prompt = `Classify this email reply and (if out_of_office) extract a return date if present.
Return JSON: { "intent": "...", "confidence": 0-1, "return_date": "YYYY-MM-DD|null" }.
Email:
${msg.body_text ?? ""}`;

  const completion = await client.chat.completions.create({
    model: process.env.STRONG_MODEL ?? "gpt-4o",
    messages: [
      { role: "system", content: "You are an email intent classifier." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(completion.choices[0].message.content || "{}");
  const intent = parsed.intent ?? "unknown";
  const confidence =
    typeof parsed.confidence === "number"
      ? parsed.confidence
      : Number(parsed.confidence ?? 0.5) || 0.5;

  const nowIso = new Date().toISOString();

  await supabase
    .from("inbox_threads")
    .update({
      ai_intent: intent,
      ai_confidence: confidence,
      ai_classified_at: nowIso,
      last_classified_at: nowIso,
      needs_review: false,
      last_classify_err: null,
    })
    .eq("id", thread_id);

  await supabase.from("ai_reply_classifications").insert({
    thread_id,
    message_id: null,
    model: process.env.STRONG_MODEL ?? "gpt-4o",
    ai_intent: intent,
    ai_confidence: confidence,
    meta: { source: "strong_reclassify" },
  });

  await supabase.rpc("resolve_review", {
    p_thread_id: thread_id,
    p_user: me.user.id,
  });

  return NextResponse.json({ ok: true, intent, confidence });
}

