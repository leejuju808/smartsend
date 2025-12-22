// Block 484 — AI Objection Playbooks + OTA (Objection Tactic Automation)
// Given a thread_id (and optionally specific objection_id), this finds the most recent objection,
// loads the campaign → playbook, looks up the corresponding ai_sdr_objection_tactics row,
// and executes behavior based on action.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

type Payload = {
  user_id: string;
  thread_id: string;
  objection_id?: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPENAI_KEY")! });

  const { user_id, thread_id, objection_id } = await req.json() as Payload;

  // 1) Load thread + lead + campaign
  const { data: threadRow, error: threadErr } = await supabase
    .from("ai_sdr_threads")
    .select("id, lead_id, campaign_id")
    .eq("id", thread_id)
    .single();
  if (threadErr || !threadRow) {
    console.error("Thread not found", threadErr);
    return new Response("Thread not found", { status: 404 });
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("id, email, first_name, last_name")
    .eq("id", threadRow.lead_id)
    .single();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, subject, from_name, ai_sdr_playbook_id")
    .eq("id", threadRow.campaign_id)
    .maybeSingle();

  if (!lead) {
    return new Response("Lead not found", { status: 404 });
  }

  // 2) Find objection
  let objectionRow: any = null;
  if (objection_id) {
    const { data } = await supabase
      .from("ai_sdr_objections")
      .select("*")
      .eq("id", objection_id)
      .single();
    objectionRow = data;
  } else {
    const { data } = await supabase
      .from("ai_sdr_objections")
      .select("*")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: false })
      .limit(1);
    objectionRow = data?.[0];
  }

  if (!objectionRow) {
    return new Response("No objection found", { status: 404 });
  }

  const objectionType = objectionRow.objection_type;

  // 3) Load user settings + playbook
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user_id)
    .maybeSingle();

  const { data: playbook } = campaign?.ai_sdr_playbook_id
    ? await supabase
        .from("ai_sdr_playbooks")
        .select("*")
        .eq("id", campaign.ai_sdr_playbook_id)
        .maybeSingle()
    : { data: null as any };

  // 4) Find tactic
  const { data: tactics } = await supabase
    .from("ai_sdr_objection_tactics")
    .select("*")
    .eq("user_id", user_id)
    .eq("objection_type", objectionType)
    .order("playbook_id", { ascending: false }); // so playbook-specific first

  const tactic = tactics?.find(t => t.playbook_id === playbook?.id) ??
                 tactics?.find(t => !t.playbook_id) ??
                 null;

  if (!tactic) {
    // No tactic: just store a note and bail
    await supabase
      .from("ai_sdr_objections")
      .update({
        tactic_action: "none",
        tactic_notes: "No tactic configured for this objection type"
      })
      .eq("id", objectionRow.id);

    return new Response("No tactic configured", { status: 200 });
  }

  // Helpers
  const updateThread = async (fields: Record<string, any>) => {
    await supabase.from("ai_sdr_threads").update(fields).eq("id", thread_id);
  };

  const logEvent = async (event_type: string, details: any = {}) => {
    await supabase.from("ai_sdr_events").insert({
      thread_id,
      event_type,
      details
    });
  };

  const sendEmail = async (subject: string, body: string) => {
    const emailWebhook = Deno.env.get("EMAIL_SEND_WEBHOOK_URL");
    if (!emailWebhook) {
      console.error("EMAIL_SEND_WEBHOOK_URL not set");
      return;
    }

    await fetch(emailWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id,
        to: lead.email,
        subject,
        text: body,
        meta: {
          ai_sdr_thread_id: thread_id,
          ai_sdr_action: tactic.action,
          objection_type: objectionType
        }
      })
    });

    // also insert into `emails` table so timeline stays in sync (basic)
    const now = new Date().toISOString();
    await supabase.from("emails").insert({
      lead_id: lead.id,
      campaign_id: campaign?.id,
      subject,
      body_text: body,
      body_html: body.replace(/\n/g, "<br>"),
      is_incoming: false,
      sender: campaign?.from_name || "SmartSend",
      to_recipients: [lead.email || ""],
      sent_at: now,
      created_at: now,
    });
  };

  // Draft helper with playbook + objection context
  const draftObjectionEmail = async (mode: "followup" | "resource") => {
    const system = `
You are an SDR responding to a specific sales objection.

You represent:
- Company: ${userSettings?.company_name ?? "the user's company"}
- Role: ${userSettings?.role_title ?? "Founder"}
- Website: ${userSettings?.website_url ?? "N/A"}

Tone: ${userSettings?.email_tone ?? "professional"}.

Playbook (if any):
${playbook ? `
Name: ${playbook.name}
Target Persona: ${playbook.target_persona}
Primary Goal: ${playbook.primary_goal}
Approach Style: ${playbook.approach_style}
Messaging Guidelines:
${playbook.messaging_guidelines ?? ""}
Objection Handling Guidelines:
${playbook.objection_handling_guidelines ?? ""}
Closing Style:
${playbook.closing_style ?? ""}
` : "No custom playbook. Use B2B best practices to handle objections clearly and respectfully."}

Tactic:
- Action: ${tactic.action}
- Label: ${tactic.label ?? ""}
- Description: ${tactic.description ?? ""}
- Email Hint: ${tactic.email_prompt_hint ?? ""}

Write a short ${mode} email (3–5 sentences) responding to THIS objection.
Respectful, clear, 1 CTA max. No AI mentions.

Return JSON only:
{ "subject": "...", "body": "..." }
`.trim();

    const userContent = `
LEAD:
${JSON.stringify(lead, null, 2)}

CAMPAIGN:
${JSON.stringify(campaign ?? {}, null, 2)}

OBJECTION:
Type: ${objectionType}
Summary: ${objectionRow.objection_summary}
Original suggested reply:
${objectionRow.suggested_reply ?? ""}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" }
    });

    let subject = campaign?.subject ?? "Re: your note";
    let body = "";

    try {
      const raw = completion.choices[0].message.content ?? "{}";
      const parsed = JSON.parse(raw);
      subject = parsed.subject ?? subject;
      body = parsed.body ?? "";
    } catch (e) {
      console.error("objection draft parse error", e);
    }

    return { subject, body };
  };

  // 5) Execute tactic
  let executed = false;
  let notes = "";

  if (tactic.action === "auto_mute") {
    await updateThread({
      inbox_state: "muted",
      inbox_state_reason: tactic.label ?? "Auto-muted via objection tactic",
      inbox_state_updated_at: new Date().toISOString()
    });
    await logEvent("nbm_pause", { via: "objection_tactic", objectionType });
    executed = true;
    notes = "Thread muted via objection tactic";
  }

  if (tactic.action === "auto_archive") {
    await updateThread({
      inbox_state: "archived",
      inbox_state_reason: tactic.label ?? "Auto-archived via objection tactic",
      inbox_state_updated_at: new Date().toISOString()
    });
    await logEvent("nbm_wait", { via: "objection_tactic", objectionType });
    executed = true;
    notes = "Thread archived via objection tactic";
  }

  if (tactic.action === "auto_wait") {
    const days = tactic.wait_days ?? 30;
    const next = new Date(Date.now() + days * 24 * 3600 * 1000);
    await updateThread({
      status: "idle",
      next_action_at: next.toISOString(),
      inbox_state: "archived",
      inbox_state_reason: tactic.label ?? `Auto-wait ${days} days via tactic`,
      inbox_state_updated_at: new Date().toISOString()
    });
    await logEvent("nbm_wait", { via: "objection_tactic", objectionType, wait_days: days });
    executed = true;
    notes = `Thread scheduled to revisit in ${days} days`;
  }

  if (tactic.action === "auto_send_followup" || tactic.action === "auto_send_resource") {
    const mode = tactic.action === "auto_send_followup" ? "followup" : "resource";
    const draft = await draftObjectionEmail(mode);
    await sendEmail(draft.subject, draft.body);

    await updateThread({
      last_message_from: "me",
      last_message_at: new Date().toISOString(),
      status: "awaiting_reply",
      next_action_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    });

    await logEvent("send_followup", {
      via: "objection_tactic",
      objectionType,
      subject: draft.subject
    });

    executed = true;
    notes = `Auto-sent ${mode} email via objection tactic`;
  }

  if (tactic.action === "manual") {
    executed = false;
    notes = "Manual-only tactic; suggested in UI but not auto-run";
  }

  // 6) Update objection row
  await supabase
    .from("ai_sdr_objections")
    .update({
      tactic_action: tactic.action,
      tactic_executed_at: executed ? new Date().toISOString() : null,
      tactic_notes: notes
    })
    .eq("id", objectionRow.id);

  return new Response(JSON.stringify({ ok: true, tactic_action: tactic.action, executed }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});

