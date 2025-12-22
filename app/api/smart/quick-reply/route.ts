import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openaiClient = new OpenAI();

function fillTokens(tpl: string, vars: Record<string, string>) {
  if (!tpl) return tpl;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export async function POST(req: Request) {
  const { thread_id, tone = "friendly" }: { thread_id?: string; tone?: string } = await req.json();

  if (!thread_id) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id, lead_id, campaign_id, ai_intent, needs_review, is_suppressed")
    .eq("id", thread_id)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }
  if (thread.is_suppressed) {
    return NextResponse.json({ error: "suppressed" }, { status: 400 });
  }

  const { data: latestInbound, error: latestInboundError } = await supabase
    .from("inbox_messages")
    .select("body_text")
    .eq("thread_id", thread_id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestInboundError) {
    return NextResponse.json({ error: "message_lookup_failed", detail: latestInboundError.message }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, email, first_name, company, campaign_id")
    .eq("id", thread.lead_id)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }
  if (!lead.email) {
    return NextResponse.json({ error: "lead_missing_email" }, { status: 400 });
  }

  const scenario = thread.ai_intent ?? "neutral";

  const { data: variant, error: variantError } = await supabase
    .from("nudge_variants")
    .select("id, subject, body")
    .eq("campaign_id", thread.campaign_id)
    .eq("scenario", scenario)
    .eq("tone", tone)
    .eq("is_active", true)
    .order("weight", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (variantError) {
    return NextResponse.json({ error: "variant_lookup_failed", detail: variantError.message }, { status: 400 });
  }

  let subject = variant?.subject ?? "Re: Your note";
  let body = variant?.body ?? "";

  if (!variant?.body) {
    const basePrompt = `Draft a short, courteous reply email in ${tone} tone that matches this context.
- Keep it 3-6 sentences with a single clear CTA.
- If the user asked a question, answer it directly.
- If out_of_office, acknowledge and set a next step.

Input:
${latestInbound?.body_text ?? "(no prior body)"}`;

    try {
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: basePrompt }],
      });
      body = completion.choices[0]?.message?.content ?? "Thanks for the note!";
    } catch (err) {
      console.error("openai_error", err);
      body = "Thanks for the note!";
    }
  }

  const tokenVars: Record<string, string> = {
    first_name: lead.first_name ?? "",
    company: lead.company ?? "",
  };
  const finalSubject = fillTokens(subject, tokenVars);
  const finalBody = fillTokens(body, tokenVars);

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, owner_id")
    .eq("id", thread.campaign_id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
  }

  const senderEmail = "no-reply@yourbrand.com";
  const idemKey = `qr:${thread_id}:${Date.now()}`;

  const { data: gate, error: gateError } = await supabase.rpc("preflight_check", {
    p_campaign_id: thread.campaign_id,
    p_account_id: campaign.owner_id,
    p_lead_id: thread.lead_id,
    p_to: lead.email,
    p_sender_email: senderEmail,
    p_idem_key: idemKey,
  });

  if (gateError) {
    return NextResponse.json({ error: gateError.message }, { status: 400 });
  }

  if (!gate?.ok) {
    return NextResponse.json(
      { ok: false, error: gate?.error ?? "preflight_block", meta: gate?.meta ?? {} },
      { status: 409 },
    );
  }

  const { data: sendId, error: sendError } = await supabase.rpc("enqueue_send", {
    p_campaign_id: thread.campaign_id,
    p_account_id: campaign.owner_id,
    p_lead_id: thread.lead_id,
    p_to: lead.email,
    p_subject: finalSubject,
    p_body: finalBody,
    p_sender_email: senderEmail,
    p_idem_key: idemKey,
  });

  if (sendError || !sendId) {
    return NextResponse.json(
      { error: "blocked_or_failed", detail: sendError?.message },
      { status: 400 },
    );
  }

  await supabase
    .from("inbox_threads")
    .update({ last_action: "quick_reply", last_action_at: new Date().toISOString() })
    .eq("id", thread_id);

  return NextResponse.json({ ok: true, send_id: sendId, subject: finalSubject, body: finalBody });
}

