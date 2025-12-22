// app/api/meeting-intents/draft/route.ts
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

type DraftPayload = {
  reply_id: string;
};

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return Response.json(
      { error: "openai_not_configured" },
      { status: 500 }
    );
  }

  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  let body: DraftPayload;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.reply_id) {
    return Response.json(
      { error: "reply_id_required" },
      { status: 400 }
    );
  }

  // Find workspace via team_members
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Load reply with lead + campaign + workspace booking link
  const { data: reply, error: replyErr } = await supabase
    .from("reply_logs")
    .select(
      `
      id,
      workspace_id,
      lead_id,
      campaign_id,
      from_email,
      subject,
      body_plain,
      received_at,
      ai_label,
      ai_intent_summary,
      ai_meeting_intent,
      ai_confidence,
      leads:lead_id (
        id,
        first_name,
        last_name,
        email,
        company
      ),
      campaigns:campaign_id (
        id,
        name
      )
    `
    )
    .eq("id", body.reply_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (replyErr || !reply) {
    return Response.json({ error: "reply_not_found" }, { status: 404 });
  }

  const { data: workspace, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, name, booking_link")
    .eq("id", workspaceId)
    .single();

  if (wsErr || !workspace) {
    return Response.json(
      { error: "workspace_not_found" },
      { status: 404 }
    );
  }

  const draftPrompt = buildDraftPrompt(reply, workspace);

  try {
    const completionRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "meeting_reply_draft",
              schema: {
                type: "object",
                properties: {
                  subject: { type: "string" },
                  body: { type: "string" },
                },
                required: ["subject", "body"],
                additionalProperties: false,
              },
            },
          },
          messages: [
            {
              role: "system",
              content:
                "You write short, clear follow-up emails for sales meetings. Always reply with strict JSON only.",
            },
            {
              role: "user",
              content: draftPrompt,
            },
          ],
        }),
      }
    );

    if (!completionRes.ok) {
      const text = await completionRes.text();
      console.error(
        "[meeting-intents.draft] OpenAI error",
        completionRes.status,
        text
      );
      return Response.json(
        { error: "openai_error" },
        { status: 500 }
      );
    }

    const json = await completionRes.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return Response.json(
        { error: "no_content_from_openai" },
        { status: 500 }
      );
    }

    let parsed: any;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch (e) {
      console.error(
        "[meeting-intents.draft] parse error",
        e,
        content
      );
      return Response.json(
        { error: "parse_error" },
        { status: 500 }
      );
    }

    const subject: string = parsed.subject ?? "";
    const bodyText: string = parsed.body ?? "";

    return Response.json(
      {
        subject,
        body: bodyText,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[meeting-intents.draft] unexpected error", err);
    return Response.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}

function buildDraftPrompt(reply: any, workspace: any): string {
  const lead = reply.leads;
  const campaign = reply.campaigns;
  const workspaceName = workspace.name || "our team";

  const leadName =
    (lead?.first_name || "") +
    (lead?.last_name ? ` ${lead.last_name}` : "");
  const leadEmail = lead?.email || reply.from_email || "";
  const company = lead?.company || "";
  const campaignName = campaign?.name || "";
  const intent = reply.ai_meeting_intent || "meeting_requested";
  const summary = reply.ai_intent_summary || "";
  const originalSubject = reply.subject || "";
  const originalBody = reply.body_plain || "";
  const bookingLink = workspace.booking_link || "";

  const intentText =
    intent === "meeting_confirmed"
      ? "They confirmed a specific time or said yes to meeting."
      : intent === "followup_needed"
      ? "They are interested but need clarification or next steps."
      : "They asked to schedule a call or meeting.";

  const bookingInstruction = bookingLink
    ? `You MUST include this booking link exactly once in the email body in a natural sentence: ${bookingLink}`
    : `You do NOT have a booking link. Politely propose 2–3 time slots in the next few days (use generic placeholders like "Tuesday at 2 PM" without real dates).`;

  return `
Context:
- Workspace / sender: ${workspaceName}
- Lead name: ${leadName || "(unknown)"}
- Lead email: ${leadEmail || "(unknown)"}
- Company: ${company || "(unknown)"}
- Campaign: ${campaignName || "(none)"}
- Meeting intent: ${intent}
- Intent interpretation: ${intentText}
- AI summary of their reply: ${summary || "(none)"}

Original email thread snippet:
Subject: ${originalSubject || "(none)"}
Body:
${originalBody || "(none)"}

Task:
Write a short, clear email reply that matches the meeting intent above.

Guidelines:
- Keep tone friendly, concise, and professional.
- Assume this is being sent from ${workspaceName}.
- If the lead clearly asked for times, either:
  - Invite them to use the booking link if provided, OR
  - Propose 2–3 specific time slots if no booking link.
- If they confirmed a time, respond to confirm and thank them.
- If follow-up needed, answer their question briefly and move toward getting a time.
- Use a simple text email (no HTML).
- Subject should be short and refer to the meeting (e.g., "Quick call next week?" or "Confirming our call").
- Start body with a greeting using their name if available (e.g., "Hi Alex,").

${bookingInstruction}

Return ONLY JSON of the form:
{
  "subject": "...",
  "body": "..."
}
`;
}




