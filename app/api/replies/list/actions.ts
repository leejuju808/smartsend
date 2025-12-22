"use server";

import { createClient } from "@/utils/supabase/server";

export type ReplyInboxItem = {
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

  campaign_id: string | null; // joined from send_logs
};

type ListRepliesOptions = {
  campaignId?: string | null;
  search?: string | null;
  tagId?: string | null;
};

export async function listReplies(
  accountId: string,
  options?: ListRepliesOptions
): Promise<ReplyInboxItem[]> {
  const supabase = createClient();
  const { campaignId, search, tagId } = options || {};

  // If filtering by tag, first get all leads with this tag
  let leadIds: string[] | null = null;
  if (tagId) {
    const { data: tagged, error: tagError } = await supabase
      .from("lead_tag_links")
      .select("lead_id")
      .eq("tag_id", tagId);

    if (tagError) throw tagError;
    leadIds = tagged?.map((t) => t.lead_id) ?? [];
    // If no matching leads, return empty array
    if (leadIds.length === 0) return [];
  }

  // If filtering by campaign, first get matching send_log_ids
  let sendLogIds: string[] | null = null;
  if (campaignId) {
    const { data: logs, error: logsError } = await supabase
      .from("send_logs")
      .select("id, lead_id")
      .eq("campaign_id", campaignId)
      .eq("account_id", accountId);

    if (logsError) throw logsError;
    
    // If also filtering by tag, filter logs by lead_ids
    if (tagId && leadIds && leadIds.length > 0) {
      sendLogIds = logs?.filter((l) => leadIds!.includes(l.lead_id)).map((l) => l.id) ?? [];
    } else {
      sendLogIds = logs?.map((l) => l.id) ?? [];
    }
    
    // If no matching logs, return empty array
    if (sendLogIds.length === 0) return [];
  } else if (tagId && leadIds && leadIds.length > 0) {
    // Filter by tag only - get send_logs for these leads
    const { data: logs, error: logsError } = await supabase
      .from("send_logs")
      .select("id")
      .in("lead_id", leadIds)
      .eq("account_id", accountId);

    if (logsError) throw logsError;
    sendLogIds = logs?.map((l) => l.id) ?? [];
    if (sendLogIds.length === 0) return [];
  }

  let query = supabase
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
      send_logs ( campaign_id )
    `
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sendLogIds && sendLogIds.length > 0) {
    // filter by send_log_ids
    query = query.in("send_log_id", sendLogIds);
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(
      `from_email.ilike.${q},subject.ilike.${q},raw_text.ilike.${q}`
    );
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as any[];

  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    account_id: r.account_id,
    send_log_id: r.send_log_id,
    from_email: r.from_email,
    to_email: r.to_email,
    subject: r.subject,
    raw_text: r.raw_text,
    ai_label: r.ai_label,
    ai_score: r.ai_score,
    reply_kind: r.reply_kind,
    has_meeting_intent: r.has_meeting_intent,
    is_unsubscribe: r.is_unsubscribe,
    is_bounce: r.is_bounce,
    campaign_id: r.send_logs?.campaign_id ?? null,
  })) as ReplyInboxItem[];
}

