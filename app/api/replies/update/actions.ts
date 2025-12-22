"use server";

import { createClient } from "@/utils/supabase/server";

export type UpdateReplyInput = {
  replyId: string;

  label?: string | null;

  reply_kind?:
    | "positive_meeting"
    | "positive_no_meeting"
    | "neutral_question"
    | "ooh"
    | "unsubscribe"
    | "bounce"
    | "other";

  has_meeting_intent?: boolean;
  is_unsubscribe?: boolean;
  is_bounce?: boolean;

  handled_status?: "open" | "done";
};

export async function updateReplyClassification(input: UpdateReplyInput) {
  const supabase = createClient();

  const { replyId } = input;
  if (!replyId) throw new Error("Missing replyId");

  // 1) Load reply + send_log_id
  const { data: replyRow, error: replyError } = await supabase
    .from("email_replies")
    .select("id, account_id, send_log_id")
    .eq("id", replyId)
    .single();

  if (replyError || !replyRow) {
    throw new Error("Reply not found");
  }

  // 2) Build updated fields for email_replies
  const update: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof input.label !== "undefined") {
    update.ai_label = input.label;
  }
  if (typeof input.reply_kind !== "undefined") {
    update.reply_kind = input.reply_kind;
  }
  if (typeof input.has_meeting_intent !== "undefined") {
    update.has_meeting_intent = input.has_meeting_intent;
  }
  if (typeof input.is_unsubscribe !== "undefined") {
    update.is_unsubscribe = input.is_unsubscribe;
  }
  if (typeof input.is_bounce !== "undefined") {
    update.is_bounce = input.is_bounce;
  }
  if (typeof input.handled_status !== "undefined") {
    update.handled_status = input.handled_status;
  }

  const { error: updateReplyError } = await supabase
    .from("email_replies")
    .update(update)
    .eq("id", replyId);

  if (updateReplyError) {
    throw updateReplyError;
  }

  let leadId: string | null = null;

  // 3) Update send_logs (reply_status + label)
  if (replyRow.send_log_id) {
    const { data: sendLog, error: sendLogError } = await supabase
      .from("send_logs")
      .select("id, lead_id")
      .eq("id", replyRow.send_log_id)
      .single();

    if (!sendLogError && sendLog) {
      leadId = sendLog.lead_id ?? null;

      const sendUpdate: Record<string, any> = {
        reply_status: "replied",
        replied_at: new Date().toISOString(),
      };

      if (input.label) {
        sendUpdate.reply_label = input.label;
      } else if (input.reply_kind) {
        sendUpdate.reply_label = input.reply_kind;
      }

      const { error: updateLogError } = await supabase
        .from("send_logs")
        .update(sendUpdate)
        .eq("id", sendLog.id);

      if (updateLogError) {
        console.error(updateLogError);
      }
    }
  }

  // 4) Update lead-level email_status if we have a lead
  if (leadId) {
    let nextStatus: "active" | "replied" | "unsubscribed" | "bounced" | null = null;

    const isUnsub =
      input.is_unsubscribe ||
      input.reply_kind === "unsubscribe";

    const isBounce =
      input.is_bounce ||
      input.reply_kind === "bounce";

    if (isUnsub) {
      nextStatus = "unsubscribed";
    } else if (isBounce) {
      nextStatus = "bounced";
    } else if (
      input.reply_kind === "positive_meeting" ||
      input.reply_kind === "positive_no_meeting" ||
      input.reply_kind === "neutral_question"
    ) {
      nextStatus = "replied";
    }

    if (nextStatus) {
      const { error: updateLeadError } = await supabase
        .from("leads")
        .update({
          email_status: nextStatus,
          last_reply_at: new Date().toISOString(),
          last_reply_kind: input.reply_kind ?? null,
        })
        .eq("id", leadId);

      if (updateLeadError) {
        console.error(updateLeadError);
      }
    }
  }

  return { ok: true };
}
