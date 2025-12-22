"use server";

import { createClient } from "@/utils/supabase/server";
import type { LeadRow } from "@/app/api/leads/list/actions";

export type LeadDetail = LeadRow & {
  phone?: string | null;
  website?: string | null;
};

export type LeadTimelineEvent =
  | {
      type: "send";
      id: string;
      created_at: string;
      campaign_id: string | null;
      campaign_name: string | null;
      status: string | null;
      reply_status: string | null;
      reply_label: string | null;
      replied_at: string | null;
    }
  | {
      type: "reply";
      id: string;
      created_at: string;
      send_log_id: string | null;
      ai_label: string | null;
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
      raw_text: string | null;
    };

// 1) Basic lead detail
export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("leads")
    .select(
      `
      id,
      account_id,
      email,
      first_name,
      last_name,
      company,
      title,
      city,
      country,
      tags,
      email_status,
      last_reply_at,
      last_reply_kind,
      created_at,
      phone,
      website
    `
    )
    .eq("id", leadId)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data as LeadDetail;
}

// 2) Combined timeline of sends + replies
export async function getLeadTimeline(
  leadId: string
): Promise<LeadTimelineEvent[]> {
  const supabase = createClient();

  // a) Get sends for this lead, with campaign name
  const { data: sends, error: sendError } = await supabase
    .from("send_logs")
    .select(
      `
      id,
      created_at,
      campaign_id,
      status,
      reply_status,
      reply_label,
      replied_at,
      campaigns ( name )
    `
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (sendError) {
    console.error(sendError);
    return [];
  }

  const sendEvents: LeadTimelineEvent[] = (sends ?? []).map((s: any) => ({
    type: "send",
    id: s.id,
    created_at: s.created_at,
    campaign_id: s.campaign_id ?? null,
    campaign_name: s.campaigns?.name ?? null,
    status: s.status ?? null,
    reply_status: s.reply_status ?? null,
    reply_label: s.reply_label ?? null,
    replied_at: s.replied_at ?? null,
  }));

  const sendIds = (sends ?? []).map((s: any) => s.id) as string[];

  // b) Get replies linked to those sends
  let replyEvents: LeadTimelineEvent[] = [];
  if (sendIds.length > 0) {
    const { data: replies, error: repliesError } = await supabase
      .from("email_replies")
      .select(
        `
        id,
        created_at,
        send_log_id,
        ai_label,
        reply_kind,
        has_meeting_intent,
        is_unsubscribe,
        is_bounce,
        raw_text
      `
      )
      .in("send_log_id", sendIds)
      .order("created_at", { ascending: true });

    if (repliesError) {
      console.error(repliesError);
    } else {
      replyEvents = (replies ?? []).map((r: any) => ({
        type: "reply",
        id: r.id,
        created_at: r.created_at,
        send_log_id: r.send_log_id ?? null,
        ai_label: r.ai_label ?? null,
        reply_kind: r.reply_kind ?? null,
        has_meeting_intent: r.has_meeting_intent ?? null,
        is_unsubscribe: r.is_unsubscribe ?? null,
        is_bounce: r.is_bounce ?? null,
        raw_text: r.raw_text ?? null,
      }));
    }
  }

  // c) Merge & sort by created_at
  const combined: LeadTimelineEvent[] = [...sendEvents, ...replyEvents];

  combined.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return ta - tb;
  });

  return combined;
}













