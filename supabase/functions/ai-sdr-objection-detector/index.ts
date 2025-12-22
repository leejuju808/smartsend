// Block 483 — AI SDR Objection Detection Engine
// Triggered automatically on ANY inbound email to detect objections and generate suggested replies

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { email_id } = await req.json();

  if (!email_id) {
    return new Response("email_id is required", { status: 400 });
  }

  // 1) Fetch email + thread
  const { data: email, error: emailError } = await supabase
    .from("emails")
    .select("*, leads(*), campaigns(*), ai_sdr_threads(*)")
    .eq("id", email_id)
    .single();

  if (emailError || !email) {
    return new Response("No email found", { status: 404 });
  }

  // Only process inbound emails
  if (!email.is_incoming) {
    return new Response("Not an inbound email", { status: 200 });
  }

  const thread = Array.isArray(email.ai_sdr_threads) 
    ? email.ai_sdr_threads[0] 
    : email.ai_sdr_threads;

  if (!thread) {
    return new Response("Not an SDR-managed thread", { status: 200 });
  }

  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_KEY")! });

  // 2) AI: classify objection
  const systemPrompt = `
You are an SDR Objection Detection Engine.
Classify the inbound email.

Return STRICT JSON ONLY:

{
  "type": "not_interested" | "too_expensive" | "no_budget" | "bad_timing" | "using_competitor" | "not_decision_maker" | "come_back_later" | "send_info" | "spam_complaint" | "unclear" | "other",
  "confidence": number between 0 and 1,
  "summary": string,
  "suggested_reply": string
}
  `.trim();

  const emailBody = email.body_text || email.body_html || email.body || "";
  const userPrompt = `
EMAIL FROM LEAD:

${emailBody}
  `.trim();

  let result;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      return new Response("Model output error", { status: 500 });
    }

    result = JSON.parse(content);
  } catch (error) {
    console.error("OpenAI error:", error);
    return new Response("Model output error", { status: 500 });
  }

  // Validate result structure
  if (!result.type || typeof result.confidence !== "number") {
    return new Response("Invalid model output", { status: 500 });
  }

  // 3) Save objection record
  const { data: insertedObjection, error: insertError } = await supabase.from("ai_sdr_objections").insert({
    thread_id: thread.id,
    email_id: email.id,
    objection_type: result.type,
    confidence: result.confidence,
    objection_summary: result.summary || null,
    suggested_reply: result.suggested_reply || null
  }).select().single();

  if (insertError) {
    console.error("Error inserting objection:", insertError);
    return new Response("Failed to save objection", { status: 500 });
  }

  // 3.5) Optionally auto-run tactics if configured
  // Get user_id from lead
  const lead = Array.isArray(email.leads) ? email.leads[0] : email.leads;
  const campaign = Array.isArray(email.campaigns) ? email.campaigns[0] : email.campaigns;
  const user_id = lead?.user_id || campaign?.user_id;

  if (user_id && insertedObjection?.id) {
    // Check if there's a tactic with auto_execute = true for this objection type
    const { data: tactics } = await supabase
      .from("ai_sdr_objection_tactics")
      .select("*")
      .eq("user_id", user_id)
      .eq("objection_type", result.type)
      .eq("auto_execute", true)
      .limit(1);

    if (tactics && tactics.length > 0) {
      // Auto-fire the tactic engine (fire-and-forget)
      const edgeUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/ai-sdr-apply-objection-tactic";
      fetch(edgeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify({
          user_id,
          thread_id: thread.id,
          objection_id: insertedObjection.id
        })
      }).catch((err) => {
        console.error("Failed to auto-run objection tactic:", err);
        // Don't throw - tactic execution failure shouldn't break objection detection
      });
    }
  }

  // 4) Apply auto-routing rules
  let newState = null;
  let reason = null;

  switch (result.type) {
    case "not_interested":
    case "spam_complaint":
      newState = "muted";
      reason = "Auto-muted due to objection: " + result.type;
      break;

    case "bad_timing":
    case "no_budget":
    case "come_back_later":
      newState = "archived";
      reason = "Auto-archived objection: " + result.type;
      break;

    case "using_competitor":
    case "not_decision_maker":
    case "send_info":
      // keep active but reduce priority
      await supabase.from("ai_sdr_threads").update({
        health_score: Math.max(5, (thread.health_score ?? 50) - 20),
        health_label: "warm"
      }).eq("id", thread.id);
      break;
  }

  if (newState) {
    await supabase.from("ai_sdr_threads").update({
      inbox_state: newState,
      inbox_state_reason: reason,
      inbox_state_updated_at: new Date().toISOString()
    })
    .eq("id", thread.id);
  }

  return new Response(JSON.stringify({ ok: true, objection_type: result.type }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});

