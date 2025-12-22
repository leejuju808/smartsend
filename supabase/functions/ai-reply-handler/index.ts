import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const LABELS = ["Interested", "Booking Request", "Not Now", "Objection", "Unsubscribe", "Other"] as const;
type Label = typeof LABELS[number];

async function classify(text: string) {
  const sys = `You are an SDR assistant. Return a JSON object {intent, confidence, rationale} where intent is one of ${LABELS.join(", ")} and confidence is 0-1. Keep rationale under 25 words.`;

  const rsp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: text.slice(0, 4000) }
    ],
    temperature: 0.2
  });

  try {
    return JSON.parse(rsp.choices[0].message?.content || "{}");
  } catch {
    return { intent: "Other", confidence: 0.5, rationale: "Parse error" };
  }
}

async function handleAction(rec: any, intent: Label) {
  // Pause any active sequence for this lead
  await supabase.from("sequence_enrollments")
    .update({ status: "paused_replied", paused_reason: "reply" })
    .eq("lead_id", rec.lead_id)
    .neq("status", "paused_replied");

  // Intent-based actions
  if (intent === "Interested" || intent === "Booking Request") {
    await supabase.from("leads").update({ stage: "qualified" }).eq("id", rec.lead_id);

    await supabase.from("sales_tasks").insert({
      org_id: rec.org_id,
      lead_id: rec.lead_id,
      type: "demo",
      notes: "Interested reply detected. Offer calendar link.",
      due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    });

    // Prepare AI draft with booking CTA
    await supabase.from("ai_followup_queue").insert({
      org_id: rec.org_id,
      thread_id: rec.thread_id,
      lead_id: rec.lead_id,
      ai_prompt: "Write a concise booking CTA reply. Offer two times and a calendar link.",
      ai_draft: `Awesome — happy to show you SmartSend. Does **Tue 10:00** or **Wed 2:00** work?\nOr pick a time here: ${Deno.env.get("BOOKING_LINK") ?? "https://cal.com/yourlink"}`,
      scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: "pending"
    });
  }

  if (intent === "Objection") {
    await supabase.from("leads").update({ stage: "engaged" }).eq("id", rec.lead_id);

    await supabase.from("sales_tasks").insert({
      org_id: rec.org_id,
      lead_id: rec.lead_id,
      type: "followup",
      notes: "Objection detected. Send tailored response.",
      due_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString()
    });
  }

  if (intent === "Not Now") {
    await supabase.from("leads").update({ stage: "engaged" }).eq("id", rec.lead_id);

    // Schedule a polite bump in 30 days
    await supabase.from("ai_followup_queue").insert({
      org_id: rec.org_id,
      thread_id: rec.thread_id,
      lead_id: rec.lead_id,
      ai_prompt: "Write a friendly 30-day check-in acknowledging 'not now'.",
      ai_draft: "Circling back in case timing improved — want me to resend a quick 60s demo?",
      scheduled_for: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      status: "pending"
    });
  }

  if (intent === "Unsubscribe") {
    await supabase.from("leads").update({ stage: "unsubscribed" }).eq("id", rec.lead_id);

    // Add automation rule to prevent future contact
    await supabase.from("automation_rules").insert({
      org_id: rec.org_id,
      name: "Global Unsubscribe Tag",
      trigger_event: "reply_email",
      condition: { contains: "unsubscribe" },
      action: { type: "add_tag", value: "do_not_contact" },
      enabled: true
    });
  }
}

serve(async (req) => {
  try {
    const { message_id } = await req.json();

    const { data: rec } = await supabase.from("channel_messages").select("*").eq("id", message_id).single();

    if (!rec || rec.direction !== "inbound") {
      return new Response("skip", { status: 200 });
    }

    const analysis = await classify(rec.body || "");

    await supabase.from("channel_messages")
      .update({ ai_intent: analysis.intent, ai_confidence: analysis.confidence })
      .eq("id", message_id);

    await handleAction(rec, analysis.intent as Label);

    return new Response(
      JSON.stringify({ ok: true, intent: analysis.intent, conf: analysis.confidence }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in ai-reply-handler:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
});
