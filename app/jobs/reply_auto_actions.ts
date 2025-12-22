// Block 300 — Adaptive Reply Brain v2
// Auto-actions based on reply intent classification

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ReplyIntent {
  id: string;
  reply_id: string;
  workspace_id: string | null;
  category: string | null;
  sentiment: string | null;
  intent_score: number | null;
  meeting_time: string | null;
  meeting_timezone: string | null;
  meeting_location: string | null;
  meeting_link: string | null;
  objection_type: string | null;
}

export interface Reply {
  id: string;
  email_log_id: string | null;
  lead_id?: string | null;
  workspace_id?: string | null;
  campaign_id?: string | null;
}

/**
 * Process auto-actions based on reply intent classification
 */
export async function processReplyAutoActions(intent: ReplyIntent, reply: Reply) {
  if (!intent.category) {
    return { processed: false, reason: "no_category" };
  }

  const actions: string[] = [];

  try {
    // 1. Unsubscribe detection
    if (intent.category === "unsubscribe") {
      if (reply.lead_id) {
        await supabase
          .from("leads")
          .update({ unsubscribed: true })
          .eq("id", reply.lead_id);
        actions.push("unsubscribed_lead");
      }

      // Also add to suppressions if we have the email
      const { data: emailReply } = await supabase
        .from("email_replies")
        .select("from_email")
        .eq("id", reply.id)
        .maybeSingle();

      if (emailReply?.from_email && reply.workspace_id) {
        // Get user_id from workspace
        const { data: member } = await supabase
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", reply.workspace_id)
          .limit(1)
          .maybeSingle();

        if (member?.user_id) {
          await supabase.from("suppressions").upsert({
            user_id: member.user_id,
            email: emailReply.from_email.toLowerCase(),
            reason: "unsubscribe",
            source: "reply_intent",
          });
          actions.push("added_to_suppressions");
        }
      }
    }

    // 2. Meeting detection
    if (intent.category === "meeting" && reply.lead_id && reply.workspace_id) {
      const start = intent.meeting_time; // already timestamptz or ISO
      const end = start ? new Date(new Date(start).getTime() + 30 * 60 * 1000) : null; // 30-min default

      // Try to find or create reply_logs entry for reply_id
      let replyLogId: string | null = null;
      if (reply.id) {
        // Try to find existing reply_logs entry by email_id or create one
        const { data: existingLog } = await supabase
          .from("reply_logs")
          .select("id")
          .eq("email_id", reply.id)
          .maybeSingle();

        if (existingLog) {
          replyLogId = existingLog.id;
        } else {
          // Create a reply_logs entry if it doesn't exist
          const { data: newLog, error: logError } = await supabase
            .from("reply_logs")
            .insert({
              email_id: reply.id,
              campaign_id: reply.campaign_id || null,
              type: "reply",
              confidence: (intent.intent_score || 80) / 100,
            })
            .select("id")
            .single();

          if (!logError && newLog) {
            replyLogId = newLog.id;
          }
        }
      }

      const { data: meeting } = await supabase.from("lead_meetings").insert({
        workspace_id: reply.workspace_id,
        lead_id: reply.lead_id,
        campaign_id: reply.campaign_id || null,
        reply_id: replyLogId,
        title: `Intro call with ${intent.meeting_location || 'lead'}`,
        start_time: start,
        end_time: end,
        timezone: intent.meeting_timezone || null,
        location: intent.meeting_location || null,
        link: intent.meeting_link || null,
        status: "new",
      }).select("id").single();

      // Create notification for workspace owner
      if (reply.workspace_id && meeting) {
        try {
          // Find workspace owner (first team member by created_at)
          const { data: owner } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("workspace_id", reply.workspace_id)
            .order("created_at", { ascending: true })
            .limit(1)
            .single();

          if (owner) {
            await supabase.from("notifications").insert({
              workspace_id: reply.workspace_id,
              user_id: owner.user_id,
              type: "meeting",
              title: "New meeting detected",
              body: "A lead wants to book a meeting.",
              data: {
                lead_id: reply.lead_id,
                meeting_id: meeting.id,
              },
            });
          }
        } catch (err) {
          console.error("Failed to create meeting notification:", err);
          // Don't fail the request if notification fails
        }
      }

      // Log to workspace_activity
      if (reply.workspace_id && meeting) {
        await supabase.from("workspace_activity").insert({
          workspace_id: reply.workspace_id,
          actor_id: null, // System action
          event_type: "meeting_created",
          description: "Meeting created from reply",
          lead_id: reply.lead_id,
          campaign_id: reply.campaign_id || null,
          metadata: { meeting_id: meeting.id, time: intent.meeting_time },
        }).catch((err) => {
          console.error("Failed to log meeting creation activity:", err);
        });
      }

      actions.push("created_meeting");
    }

    // 3. Positive engagement - mark as engaged
    if (intent.category === "positive" && intent.intent_score && intent.intent_score > 70) {
      if (reply.lead_id) {
        await supabase
          .from("leads")
          .update({ status: "engaged" })
          .eq("id", reply.lead_id);
        actions.push("marked_engaged");
      }
    }

    // 4. Objection detection
    if (intent.category === "objection" && intent.objection_type && reply.lead_id) {
      // Try to insert into thread_objections or create a simple objections log
      const objectionData: any = {
        lead_id: reply.lead_id,
        type: intent.objection_type,
        source: "reply_intent",
        created_at: new Date().toISOString(),
      };

      if (reply.workspace_id) {
        objectionData.workspace_id = reply.workspace_id;
      }

      // Try thread_objections first (if it exists)
      const { error: objectionError } = await supabase
        .from("thread_objections")
        .insert({
          tag_key: intent.objection_type,
          confidence: 0.8,
          account_id: reply.workspace_id || reply.lead_id, // fallback
          thread_id: reply.id, // using reply_id as thread_id
        });

      if (objectionError) {
        // Fallback: log to a simple objections table or activity log
        console.log("Objection detected:", intent.objection_type, "for lead:", reply.lead_id);
        actions.push("detected_objection");
      } else {
        actions.push("logged_objection");
      }
    }

    // 5. Negative sentiment - pause followups
    if (intent.sentiment === "negative" && intent.intent_score && intent.intent_score < 30) {
      if (reply.lead_id) {
        // Pause lead in all campaigns
        const { data: campaignLeads } = await supabase
          .from("campaign_leads")
          .select("campaign_id")
          .eq("lead_id", reply.lead_id);

        if (campaignLeads) {
          for (const cl of campaignLeads) {
            await supabase
              .from("campaign_leads")
              .update({
                paused_at: new Date().toISOString(),
                pause_reason: "negative_sentiment",
              })
              .eq("lead_id", reply.lead_id)
              .eq("campaign_id", cl.campaign_id);
          }
          actions.push("paused_followups");
        }
      }
    }

    return { processed: true, actions };
  } catch (error: any) {
    console.error("Error processing auto-actions:", error);
    return { processed: false, error: error.message, actions };
  }
}

/**
 * Process auto-actions for a reply intent by ID
 */
export async function processReplyIntentAutoActions(intentId: string) {
  const { data: intent, error: intentError } = await supabase
    .from("reply_intent")
    .select("*")
    .eq("id", intentId)
    .single();

  if (intentError || !intent) {
    return { processed: false, reason: "intent_not_found" };
  }

  // Get the reply to find lead_id
  const { data: reply, error: replyError } = await supabase
    .from("email_replies")
    .select("id, email_log_id")
    .eq("id", intent.reply_id)
    .single();

  if (replyError || !reply) {
    return { processed: false, reason: "reply_not_found" };
  }

  // Get lead_id and campaign_id from email_logs
  let leadId: string | null = null;
  let campaignId: string | null = null;
  let workspaceId: string | null = intent.workspace_id || null;

  if (reply.email_log_id) {
    const { data: emailLog } = await supabase
      .from("email_logs")
      .select("lead_id, campaign_id, user_id")
      .eq("id", reply.email_log_id)
      .maybeSingle();

    leadId = emailLog?.lead_id || null;
    campaignId = emailLog?.campaign_id || null;

    // Get workspace_id if not already set
    if (!workspaceId && emailLog?.user_id) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", emailLog.user_id)
        .limit(1)
        .maybeSingle();
      workspaceId = member?.workspace_id || null;
    }
  }

  return processReplyAutoActions(intent as ReplyIntent, {
    id: reply.id,
    email_log_id: reply.email_log_id,
    lead_id: leadId,
    workspace_id: workspaceId,
    campaign_id: campaignId,
  });
}


