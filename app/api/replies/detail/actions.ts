"use server";

import { createClient } from "@/utils/supabase/server";

export type ReplyDetail = {
  id: string;
  created_at: string;
  account_id: string;
  send_log_id: string | null;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  raw_text: string | null;
  ai_label: string | null;
  ai_score: number | null;
  reply_kind:
    | "positive_meeting"
    | "positive_no_meeting"
    | "neutral_question"
    | "ooh"
    | "unsubscribe"
    | "bounce"
    | "other"
    | null;
  has_meeting_intent: boolean | null;
  is_unsubscribe: boolean | null;
  is_bounce: boolean | null;
  handled_status: "open" | "done" | null;

  campaign_id: string | null;
  campaign_name: string | null;

  lead_id: string | null;
  lead_email: string | null;
  lead_name: string | null;
  lead_company: string | null;
  lead_title: string | null;

  // Block 486: Intent fields from lead_replies
  intent_label: string | null;
  intent_confidence: number | null;
  meeting_readiness: string | null;
  suggested_meeting_times: Array<{
    start: string;
    end: string;
    timezone: string;
    note: string;
  }> | null;
};

export async function getReplyDetail(replyId: string): Promise<ReplyDetail | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("email_replies")
    .select(
      `
      id,
      created_at,
      account_id,
      send_log_id,
      from_email,
      to_email,
      subject,
      raw_text,
      ai_label,
      ai_score,
      reply_kind,
      has_meeting_intent,
      is_unsubscribe,
      is_bounce,
      handled_status,
      send_logs (
        id,
        campaign_id,
        lead_id,
        campaigns ( name ),
        leads ( first_name, last_name, email, company, title )
      )
    `
    )
    .eq("id", replyId)
    .single();

  if (error || !data) {
    console.error(error);
    return null;
  }

  const sendLogs = (data as any).send_logs;

  const lead = sendLogs?.leads;
  const campaign = sendLogs?.campaigns;

  const fullName =
    lead && (lead.first_name || lead.last_name)
      ? [lead.first_name, lead.last_name].filter(Boolean).join(" ")
      : null;

  const leadId = sendLogs?.lead_id ?? null;

  // Block 486: Fetch intent data from lead_replies
  let intentData: {
    intent_label: string | null;
    intent_confidence: number | null;
    meeting_readiness: string | null;
    suggested_meeting_times: Array<{
      start: string;
      end: string;
      timezone: string;
      note: string;
    }> | null;
  } = {
    intent_label: null,
    intent_confidence: null,
    meeting_readiness: null,
    suggested_meeting_times: null,
  };

  if (leadId && data.subject) {
    // Try to find matching lead_reply by lead_id and subject/body_text
    const { data: leadReply } = await supabase
      .from("lead_replies")
      .select("intent_label, intent_confidence, meeting_readiness, suggested_meeting_times")
      .eq("lead_id", leadId)
      .eq("subject", data.subject)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (leadReply) {
      intentData = {
        intent_label: leadReply.intent_label ?? null,
        intent_confidence: leadReply.intent_confidence ?? null,
        meeting_readiness: leadReply.meeting_readiness ?? null,
        suggested_meeting_times: leadReply.suggested_meeting_times as any ?? null,
      };
    }
  }

  const detail: ReplyDetail = {
    id: data.id,
    created_at: data.created_at,
    account_id: data.account_id,
    send_log_id: data.send_log_id ?? null,
    from_email: data.from_email ?? null,
    to_email: data.to_email ?? null,
    subject: data.subject ?? null,
    raw_text: data.raw_text ?? null,
    ai_label: data.ai_label ?? null,
    ai_score: data.ai_score ?? null,
    reply_kind: data.reply_kind ?? null,
    has_meeting_intent: data.has_meeting_intent ?? null,
    is_unsubscribe: data.is_unsubscribe ?? null,
    is_bounce: data.is_bounce ?? null,
    handled_status: data.handled_status ?? null,

    campaign_id: sendLogs?.campaign_id ?? null,
    campaign_name: campaign?.name ?? null,

    lead_id: leadId,
    lead_email: lead?.email ?? null,
    lead_name: fullName,
    lead_company: lead?.company ?? null,
    lead_title: lead?.title ?? null,

    // Block 486: Intent fields
    intent_label: intentData.intent_label,
    intent_confidence: intentData.intent_confidence,
    meeting_readiness: intentData.meeting_readiness,
    suggested_meeting_times: intentData.suggested_meeting_times,
  };

  return detail;
}













