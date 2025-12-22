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

  manual_reply_kind:
    | "positive_meeting"
    | "positive_no_meeting"
    | "neutral_question"
    | "ooh"
    | "unsubscribe"
    | "bounce"
    | "other"
    | null;
  manual_label: string | null;
  handled_status: "none" | "done" | "ignored" | null;
  notes: string | null;
};

export async function getReplyDetail(id: string): Promise<ReplyDetail | null> {
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
      manual_reply_kind,
      manual_label,
      handled_status,
      notes
    `
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data as ReplyDetail;
}













