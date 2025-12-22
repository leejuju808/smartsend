// supabase/functions/summarize-lead-thread/index.ts
// Block 8370 — Lead Timeline Panel (Thread + AI Summary + Next Action)

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

const SUMMARY_VERSION = "gpt-4.1-mini-thread-v1";

type Stage =
  | "cold"
  | "warm"
  | "hot"
  | "closed_won"
  | "closed_lost"
  | "no_fit"
  | "unknown";

type Priority = "low" | "medium" | "high";

interface SummaryResult {
  summary: string;
  stage: Stage;
  next_action: string;
  priority: Priority;
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    const campaignId = body?.campaign_id as string | undefined;
    const leadId = body?.lead_id as string | undefined;

    if (!campaignId || !leadId) {
      return new Response("Missing campaign_id or lead_id", { status: 400 });
    }

    // 1. Load the campaign_leads row to ensure it exists
    const { data: cl, error: clError } = await supabase
      .from("campaign_leads")
      .select(
        `
        id,
        campaign_id,
        lead_id,
        status,
        last_reply_intent
      `
      )
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .single();

    if (clError || !cl) {
      console.error("No campaign_leads row found:", clError);
      return new Response("Campaign lead not found", { status: 404 });
    }

    // 2. Fetch outbound sends for this campaign/lead
    // Try campaign_sends first, fallback to send_logs
    let sends: any[] = [];
    
    // Try campaign_sends
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

    if (!sendsError && campaignSends) {
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
          to_email
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

    // 3. Fetch replies for this campaign/lead
    const { data: replies, error: repliesError } = await supabase
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

    if (repliesError) {
      console.error("Error loading replies:", repliesError);
    }

    // 4. Build timeline array
    type TimelineItem = {
      type: "sent" | "reply";
      at: string;
      from: string | null;
      to: string | null;
      subject: string | null;
      body: string;
      intent?: string | null;
      sentiment?: string | null;
    };

    const timeline: TimelineItem[] = [];

    (sends ?? []).forEach((s) => {
      timeline.push({
        type: "sent",
        at: s.sent_at,
        from: s.from_email,
        to: s.to_email,
        subject: s.subject,
        body: s.body ?? "",
      });
    });

    (replies ?? []).forEach((r) => {
      timeline.push({
        type: "reply",
        at: r.created_at,
        from: r.from_email,
        to: r.to_email,
        subject: r.subject,
        body: r.raw_text ?? "",
        intent: r.intent,
        sentiment: r.sentiment,
      });
    });

    // Sort combined timeline by time
    timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    if (timeline.length === 0) {
      return new Response("No thread for this lead yet", { status: 204 });
    }

    // 5. Build transcript string
    const transcriptLines: string[] = timeline.map((t) => {
      const role = t.type === "sent" ? "Outbound" : "Reply";
      const ts = t.at;
      const subj = t.subject ? `Subject: ${t.subject}\n` : "";
      const meta =
        t.type === "reply" && t.intent
          ? `(intent: ${t.intent}${t.sentiment ? `, sentiment: ${t.sentiment}` : ""})`
          : "";

      return `[${role} - ${ts}] ${meta}\n${subj}${t.body}\n`;
    });

    const transcript = transcriptLines.join("\n---\n");

    const userPrompt = `
You are summarizing a cold email thread between a sender (sales/BD) and a prospect.

Timeline (oldest to newest):
${transcript}

Your job:
1. Provide a concise summary (3–6 sentences) of the conversation so far.
2. Decide what stage this lead is in, using exactly one of:
   - cold
   - warm
   - hot
   - closed_won
   - closed_lost
   - no_fit
   - unknown

3. Suggest the single best next action for the SDR or founder to take in 1–2 sentences.
4. Set a priority:
   - high (clear buying interest or decision-maker engaged)
   - medium (some engagement but not urgent)
   - low (low fit, weak signals, or clearly not interested).

Focus on clarity for someone quickly reviewing many leads.
`.trim();

    // 6. Call OpenAI for structured summary
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a sales assistant summarizing cold email threads. Be concise and practical.",
        },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "thread_summary",
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              stage: {
                type: "string",
                enum: [
                  "cold",
                  "warm",
                  "hot",
                  "closed_won",
                  "closed_lost",
                  "no_fit",
                  "unknown",
                ],
              },
              next_action: { type: "string" },
              priority: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
            },
            required: ["summary", "stage", "next_action", "priority"],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    });

    const jsonPart = response.choices[0]?.message?.content ?? "{}";

    let parsed: SummaryResult;
    try {
      parsed = JSON.parse(jsonPart) as SummaryResult;
    } catch (e) {
      console.error("Failed to parse summary JSON", e, jsonPart);
      return new Response("Summary parse error", { status: 500 });
    }

    // 7. Update campaign_leads
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("campaign_leads")
      .update({
        thread_summary: parsed.summary,
        thread_stage: parsed.stage,
        thread_next_action: parsed.next_action,
        thread_priority: parsed.priority,
        thread_summary_version: SUMMARY_VERSION,
        thread_summary_updated_at: now,
      })
      .eq("id", cl.id);

    if (updateError) {
      console.error("Failed to update campaign_leads with summary:", updateError);
      return new Response("Failed to update summary", { status: 500 });
    }

    return Response.json({
      status: "ok",
      campaign_lead_id: cl.id,
      summary: parsed.summary,
      stage: parsed.stage,
      next_action: parsed.next_action,
      priority: parsed.priority,
    });
  } catch (err) {
    console.error("Unhandled error in summarize-lead-thread:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});































































