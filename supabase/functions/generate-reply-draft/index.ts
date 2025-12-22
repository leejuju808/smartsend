// supabase/functions/generate-reply-draft/index.ts
// Block 8400 — Smart Reply Drafts (AI Reply Suggestions for Hot Leads)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://esm.sh/openai@4.69.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openAIApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars");
}

if (!openAIApiKey) {
  console.error("Missing OPENAI_API_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openAIApiKey });

const DRAFT_VERSION = "gpt-4o-mini-reply-draft-v1";

// Block 8470 — Plan gating helpers
type PlanName = "free" | "pro" | "enterprise" | "unknown";

function normalizePlan(plan?: string | null, status?: string | null): {
  plan: PlanName;
  status: string;
} {
  const rawPlan = (plan ?? "free").toLowerCase() as PlanName;
  const rawStatus = (status ?? "inactive").toLowerCase();

  if (rawPlan === "pro" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "pro", status: rawStatus };
  }
  if (rawPlan === "enterprise" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "enterprise", status: rawStatus };
  }
  if (rawPlan === "free") {
    return { plan: "free", status: rawStatus };
  }
  return { plan: "unknown", status: rawStatus };
}

function hasProAI(planInfo: { plan: PlanName; status: string }): boolean {
  return planInfo.plan === "pro" || planInfo.plan === "enterprise";
}

type Tone = "casual" | "neutral" | "formal";
type Length = "short" | "medium" | "long";

interface DraftResult {
  subject: string;
  body: string;
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    const campaignId = body?.campaign_id as string | undefined;
    const leadId = body?.lead_id as string | undefined;
    const tone: Tone = (body?.tone as Tone) ?? "neutral";
    const length: Length = (body?.length as Length) ?? "medium";

    if (!campaignId || !leadId) {
      return new Response("Missing campaign_id or lead_id", { status: 400 });
    }

    // 1. Load campaign_leads + lead + summary fields
    const { data: cl, error: clError } = await supabase
      .from("campaign_leads")
      .select(
        `
        id,
        campaign_id,
        lead_id,
        status,
        last_reply_intent,
        thread_summary,
        thread_stage,
        thread_next_action,
        thread_priority,
        lead:leads (
          name,
          email
        ),
        campaign:campaigns (
          name
        )
      `
      )
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .single();

    if (clError || !cl) {
      console.error("No campaign_leads row found:", clError);
      return new Response("Campaign lead not found", { status: 404 });
    }

    // Block 8470 — Plan gating: Check if user has Pro AI access
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, owner_user_id, owner_id, user_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error("No campaign found in generate-reply-draft:", campaignError);
      return new Response("Campaign not found", { status: 404 });
    }

    const ownerUserId = campaign.owner_user_id ?? campaign.owner_id ?? campaign.user_id;
    if (ownerUserId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("plan, plan_status")
        .eq("id", ownerUserId)
        .single();

      if (profileError || !profile) {
        console.error("No profile found for generate-reply-draft:", profileError);
      } else {
        const planInfo = normalizePlan(profile.plan, profile.plan_status);
        if (!hasProAI(planInfo)) {
          return new Response(
            "Smart reply drafts are only available on Pro plans.",
            { status: 402 }
          );
        }
      }
    }

    // 2. Load timeline (sends + replies)
    // Try campaign_sends first, fallback to send_logs
    let sends: any[] = [];
    
    const { data: campaignSends, error: sendsError } = await supabase
      .from("campaign_sends")
      .select(
        `
        id,
        sent_at,
        subject,
        body,
        from_email,
        to_email
      `
      )
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: true });

    if (!sendsError && campaignSends && campaignSends.length > 0) {
      sends = campaignSends;
    } else {
      // Fallback to send_logs
      const { data: sendLogs, error: logsError } = await supabase
        .from("send_logs")
        .select(
          `
          id,
          sent_at,
          subject,
          html_rendered,
          body_preview,
          to_email,
          recipient_email
        `
        )
        .eq("campaign_id", campaignId)
        .eq("lead_id", leadId)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: true });

      if (!logsError && sendLogs) {
        sends = sendLogs.map((log) => ({
          id: log.id,
          sent_at: log.sent_at,
          subject: log.subject,
          body: log.html_rendered || log.body_preview || "",
          from_email: null,
          to_email: log.to_email || log.recipient_email,
        }));
      }
    }

    const { data: replies } = await supabase
      .from("campaign_replies")
      .select(
        `
        id,
        created_at,
        subject,
        raw_text,
        from_email,
        to_email,
        intent,
        sentiment
      `
      )
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    type TimelineItem = {
      type: "sent" | "reply";
      at: string;
      subject: string | null;
      body: string;
      from_email: string | null;
      to_email: string | null;
      intent?: string | null;
      sentiment?: string | null;
    };

    const timeline: TimelineItem[] = [];

    (sends ?? []).forEach((s) => {
      timeline.push({
        type: "sent",
        at: s.sent_at,
        subject: s.subject ?? null,
        body: s.body ?? "",
        from_email: s.from_email ?? null,
        to_email: s.to_email ?? null,
      });
    });

    (replies ?? []).forEach((r) => {
      timeline.push({
        type: "reply",
        at: r.created_at,
        subject: r.subject ?? null,
        body: r.raw_text ?? "",
        from_email: r.from_email ?? null,
        to_email: r.to_email ?? null,
        intent: r.intent ?? null,
        sentiment: r.sentiment ?? null,
      });
    });

    if (timeline.length === 0) {
      return new Response("No conversation yet to base a draft on", {
        status: 422,
      });
    }

    timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const transcriptLines = timeline.map((t) => {
      const role = t.type === "sent" ? "Outbound" : "Reply";
      const subj = t.subject ? `Subject: ${t.subject}\n` : "";
      const meta =
        t.type === "reply" && t.intent
          ? `(intent: ${t.intent}${t.sentiment ? `, sentiment: ${t.sentiment}` : ""})`
          : "";
      return `[${role} - ${t.at}] ${meta}\n${subj}${t.body}`;
    });

    const transcript = transcriptLines.join("\n---\n");

    const toneText =
      tone === "casual"
        ? "friendly, conversational, still professional"
        : tone === "formal"
        ? "polite, concise, and more formal"
        : "professional and clear (neutral tone)";

    let lengthInstruction = "";
    switch (length) {
      case "short":
        lengthInstruction = "Keep the body to 3–5 short sentences.";
        break;
      case "medium":
        lengthInstruction = "Keep the body to about 2–3 short paragraphs.";
        break;
      case "long":
        lengthInstruction =
          "You can use up to 3–5 short paragraphs if needed, but still be concise.";
        break;
    }

    const summary = cl.thread_summary ?? "";
    const stage = cl.thread_stage ?? "unknown";
    const nextAction = cl.thread_next_action ?? "";
    const priority = cl.thread_priority ?? "";

    const userPrompt = `
You are helping write a reply email in an outbound sales / BD context.

Lead info:
- Name: ${cl.lead && typeof cl.lead === "object" && "name" in cl.lead ? (cl.lead as any).name : "unknown"}
- Email: ${cl.lead && typeof cl.lead === "object" && "email" in cl.lead ? (cl.lead as any).email : "unknown"}
- Campaign: ${cl.campaign && typeof cl.campaign === "object" && "name" in cl.campaign ? (cl.campaign as any).name : "unknown"}

AI thread summary:
${summary || "(no previous summary provided)"}

Stage: ${stage}
Priority: ${priority || "unknown"}

Suggested next action (you can follow or improve): ${nextAction || "(none set)"}

Conversation timeline (oldest to newest):
${transcript}

Write a reply email from the SENDER back to the lead.

Constraints:
- Tone: ${toneText}.
- ${lengthInstruction}
- Assume we are continuing the conversation, not starting from scratch.
- Include a clear CTA that fits the stage (e.g. propose a call, ask a clarifying question, or gracefully close out).
- Do NOT over-promise or mention discounts unless the thread clearly supports it.
- Avoid hard-selling if the lead seems unsure; lean consultative.

Output JSON with:
- subject: a clear, short subject line (can reuse/adjust existing if appropriate).
- body: the full email body including greeting and sign-off, ready to send.
`.trim();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a sales copilot writing clear, respectful reply emails to prospects based on conversation history.",
        },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "reply_draft",
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
            },
            required: ["subject", "body"],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    });

    const jsonPart = response.choices[0]?.message?.content ?? "{}";

    let parsed: DraftResult;
    try {
      parsed = JSON.parse(jsonPart) as DraftResult;
    } catch (e) {
      console.error("Failed to parse draft JSON", e, jsonPart);
      return new Response("Draft parse error", { status: 500 });
    }

    // 3. Insert into reply_drafts
    const { data: draft, error: draftError } = await supabase
      .from("reply_drafts")
      .insert({
        campaign_lead_id: cl.id,
        campaign_id: cl.campaign_id,
        lead_id: cl.lead_id,
        source: "ai",
        tone,
        length,
        subject: parsed.subject,
        body: parsed.body,
        metadata: {
          version: DRAFT_VERSION,
          thread_stage: stage,
          thread_priority: priority,
          last_reply_intent: cl.last_reply_intent,
        },
        created_by: "system",
      })
      .select("id, subject, body, created_at")
      .single();

    if (draftError || !draft) {
      console.error("Failed to insert reply_drafts:", draftError);
      return new Response("Failed to save draft", { status: 500 });
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        draft_id: draft.id,
        subject: draft.subject,
        body: draft.body,
        created_at: draft.created_at,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unhandled error in generate-reply-draft:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});

