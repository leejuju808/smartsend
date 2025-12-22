import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

type ExecPayload = {
  user_id: string;
  thread_id: string;
  action: string;  // 'send_followup' | 'push_meeting' | 'send_resource' | 'wait' | 'close_won' | 'close_lost' | 'pause';
  option_label?: string; // optional from NBM options
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

  const payload = (await req.json()) as ExecPayload;
  const { user_id, thread_id, action, option_label } = payload;

  // 1) Fetch thread + join lead + campaign
  const { data: threadRow, error: threadErr } = await supabase
    .from("ai_sdr_threads")
    .select("id, lead_id, campaign_id, status, last_message_at, last_message_from")
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
    .select("id, name, subject, from_name, user_id, ai_sdr_playbook_id")
    .eq("id", threadRow.campaign_id)
    .maybeSingle();

  // Fetch user settings
  const { data: userSettings } = campaign?.user_id
    ? await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", campaign.user_id)
        .maybeSingle()
    : { data: null as any };

  // Fetch playbook
  const { data: playbook } = campaign?.ai_sdr_playbook_id
    ? await supabase
        .from("ai_sdr_playbooks")
        .select("*")
        .eq("id", campaign.ai_sdr_playbook_id)
        .maybeSingle()
    : { data: null as any };

  // We might need the timeline for AI-assisted email actions
  const { data: timeline } = await supabase
    .from("ai_sdr_timeline_items")
    .select("*")
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: true });

  // Helper: log event
  const logEvent = async (event_type: string, details: any = {}) => {
    await supabase.from("ai_sdr_events").insert({
      thread_id,
      event_type,
      details
    });
  };

  // Helper: update thread
  const updateThread = async (fields: Record<string, any>) => {
    await supabase
      .from("ai_sdr_threads")
      .update(fields)
      .eq("id", thread_id);
  };

  // Helper: send email via your central webhook
  const sendEmail = async ({
    subject,
    body
  }: {
    subject: string;
    body: string;
  }) => {
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
        to: lead?.email,
        subject,
        text: body,
        meta: {
          ai_sdr_thread_id: thread_id,
          ai_sdr_action: action,
          option_label
        }
      })
    });

    // also insert into `emails` table so timeline stays in sync (basic)
    const now = new Date().toISOString();
    await supabase.from("emails").insert({
      lead_id: threadRow.lead_id,
      campaign_id: threadRow.campaign_id,
      subject,
      body_text: body,
      body_html: body.replace(/\n/g, "<br>"),
      is_incoming: false,
      sender: campaign?.from_name || "SmartSend",
      to_recipients: [lead?.email || ""],
      sent_at: now,
      created_at: now,
    });
  };

  // Helper: get a reply draft via OpenAI (very similar to Block 476)
  const draftFromContext = async (mode: "followup" | "meeting" | "resource") => {
    const toneStyle = userSettings?.email_tone ?? "professional";
    const signoff = userSettings?.default_signoff ?? "";
    const companyName = userSettings?.company_name ?? "";
    const roleTitle = userSettings?.role_title ?? "";
    const websiteUrl = userSettings?.website_url ?? "";

    const systemPrompt = `
You are an SDR writing a ${mode} email.

You represent:
- Company: ${companyName || "the user's company"}
- Role: ${roleTitle || "Founder"}
- Website: ${websiteUrl || "N/A"}

Tone: ${toneStyle}.

Playbook:
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
` : "No custom playbook. Use general B2B outbound best practices."}

Write a short, crisp email (max ~4 sentences) that follows this playbook. One CTA max. No AI mentions.

Sign off using: "${signoff}" if it makes sense (don't duplicate if already in body).

Return either plain text body OR JSON { "subject": "...", "body": "..." }.
`.trim();

    const userPrompt = `
LEAD:
${JSON.stringify(lead)}

CAMPAIGN:
${JSON.stringify(campaign)}

TIMELINE:
${JSON.stringify(timeline ?? [], null, 2)}

NBM ACTION: ${action} (${option_label ?? ""})
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    let subject = campaign?.subject || "Quick follow-up";
    let body = "";

    try {
      const raw = completion.choices[0].message.content ?? "";
      // allow either raw body or JSON {subject,body}
      if (raw.trim().startsWith("{")) {
        const parsed = JSON.parse(raw);
        subject = parsed.subject ?? subject;
        body = parsed.body ?? "";
      } else {
        body = raw;
      }
    } catch (e) {
      console.error("Draft parse error", e);
    }

    return { subject, body };
  };

  // 2) Branch by action
  switch (action) {
    case "send_followup": {
      const draft = await draftFromContext("followup");
      await sendEmail(draft);

      await logEvent("send_followup", {
        executed_from: "nbm",
        subject: draft.subject,
        body: draft.body
      });

      await updateThread({
        last_message_from: "me",
        last_message_at: new Date().toISOString(),
        status: "awaiting_reply",
        next_action_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
      });

      break;
    }

    case "push_meeting": {
      const draft = await draftFromContext("meeting");
      await sendEmail(draft);

      await logEvent("send_followup", {
        subtype: "push_meeting",
        executed_from: "nbm",
        subject: draft.subject,
        body: draft.body
      });

      await updateThread({
        last_message_from: "me",
        last_message_at: new Date().toISOString(),
        status: "awaiting_reply",
        next_action_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString()
      });

      break;
    }

    case "send_resource": {
      const draft = await draftFromContext("resource");
      await sendEmail(draft);

      await logEvent("send_followup", {
        subtype: "send_resource",
        executed_from: "nbm",
        subject: draft.subject,
        body: draft.body
      });

      await updateThread({
        last_message_from: "me",
        last_message_at: new Date().toISOString(),
        status: "awaiting_reply",
        next_action_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString()
      });

      break;
    }

    case "wait": {
      const next = new Date(Date.now() + 72 * 3600 * 1000); // 3 days
      await logEvent("nbm_wait", {
        executed_from: "nbm",
        next_action_at: next.toISOString()
      });

      await updateThread({
        status: "idle",
        next_action_at: next.toISOString()
      });

      break;
    }

    case "pause": {
      await logEvent("nbm_pause", { executed_from: "nbm" });

      await updateThread({
        status: "idle",
        next_action_at: null,
        auto_summary_enabled: false
      });
      break;
    }

    case "close_won": {
      await logEvent("close_won", { executed_from: "nbm" });

      await updateThread({
        status: "closed_won",
        next_action_at: null
      });

      break;
    }

    case "close_lost": {
      await logEvent("close_lost", { executed_from: "nbm" });

      await updateThread({
        status: "closed_lost",
        next_action_at: null
      });

      break;
    }

    default: {
      console.error("Unknown action", action);
      return new Response("Unknown action", { status: 400 });
    }
  }

  return new Response("Action executed", { status: 200 });
});

