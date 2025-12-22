import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { detectReplyIntent } from "@/lib/ai/reply-detect";
import {
  getWorkspaceReplyCap,
  logReplyCapReached,
} from "@/lib/billing/replyCaps";

async function applyReplyFollowupRules(opts: {
  supabase: ReturnType<typeof createClient>;
  workspaceId: string;
  campaignId?: string | null;
  leadId?: string | null;
  aiCategory?: string | null;
}) {
  const { supabase, workspaceId, campaignId, leadId, aiCategory } = opts;

  if (!leadId || !aiCategory) return;

  // 1) Fetch rules: campaign-specific first, then global workspace
  let campaignRules: any[] = [];
  if (campaignId) {
    const { data } = await supabase
      .from("reply_followup_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId)
      .eq("is_enabled", true);
    campaignRules = data || [];
  }

  const { data: globalRules } = await supabase
    .from("reply_followup_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("campaign_id", null)
    .eq("is_enabled", true);

  const rules = [...(campaignRules || []), ...(globalRules || [])];

  if (!rules.length) return;

  // 2) Filter rules that match this AI category
  const matching = rules.filter((r) => !r.ai_category || r.ai_category === aiCategory);
  if (!matching.length) return;

  // 3) Apply each rule (simple v1: stop_sequence, opt_out, mark_bounced)
  for (const rule of matching) {
    if (rule.action === "stop_sequence") {
      // mark campaign_leads as "replied"/"stopped"
      if (campaignId) {
        await supabase
          .from("campaign_leads")
          .update({
            status: "replied",
            replied_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .eq("campaign_id", campaignId)
          .eq("lead_id", leadId);
      }
    }

    if (rule.action === "opt_out") {
      // mark lead as unsubscribed (global)
      await supabase
        .from("leads")
        .update({
          unsubscribed: true,
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", leadId);

      // and stop sequence if in campaign
      if (campaignId) {
        await supabase
          .from("campaign_leads")
          .update({
            status: "replied",
            replied_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .eq("campaign_id", campaignId)
          .eq("lead_id", leadId);
      }
    }

    if (rule.action === "mark_bounced") {
      // mark lead/email as bounced
      await supabase
        .from("leads")
        .update({
          bounced: true,
          bounced_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", leadId);

      if (campaignId) {
        await supabase
          .from("campaign_leads")
          .update({
            status: "replied",
            replied_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .eq("campaign_id", campaignId)
          .eq("lead_id", leadId);
      }
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { replyId } = body as { replyId: string };

    if (!replyId) {
      return NextResponse.json({ error: "Missing replyId" }, { status: 400 });
    }

    const supabase = createClient();

    // 1) Load reply row
    const { data: reply, error: replyError } = await supabase
      .from("email_replies")
      .select("id, account_id, send_log_id, raw_text")
      .eq("id", replyId)
      .single();

    if (replyError || !reply) {
      return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    }

    if (!reply.raw_text) {
      return NextResponse.json(
        { error: "Reply has no raw_text to analyze" },
        { status: 400 }
      );
    }

    // 1.5) Get workspace_id early for cap check
    let workspaceId: string | null = null;
    if (reply.send_log_id) {
      // get lead_id, campaign_id from send_logs
      const { data: sendLog } = await supabase
        .from("send_logs")
        .select("id, lead_id, campaign_id")
        .eq("id", reply.send_log_id)
        .single();

      const leadId = sendLog?.lead_id ?? null;
      const campaignId = sendLog?.campaign_id ?? null;

      // Get workspace_id from lead or campaign
      if (leadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("workspace_id")
          .eq("id", leadId)
          .single();
        workspaceId = lead?.workspace_id ?? null;
      }
      if (!workspaceId && campaignId) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("workspace_id")
          .eq("id", campaignId)
          .single();
        workspaceId = campaign?.workspace_id ?? null;
      }
    }

    // 2) Check reply cap before AI processing
    if (workspaceId) {
      const caps = await getWorkspaceReplyCap(supabase, workspaceId);

      if (caps.dailyCap !== null && caps.remaining !== null) {
        if (caps.remaining <= 0) {
          console.log(
            `[ai-reply] workspace ${workspaceId} reply cap reached (${caps.dailyCap})`
          );

          await logReplyCapReached(supabase, workspaceId, caps);

          // IMPORTANT: we still keep the raw reply, but skip AI enrichment
          return NextResponse.json(
            {
              ok: false,
              reason: "reply_cap_reached",
              daily_cap: caps.dailyCap,
              used_today: caps.usedToday,
            },
            { status: 200 }
          );
        }
      }
    }

    // 3) Run AI classifier
    const result = await detectReplyIntent(reply.raw_text);

    // 4) Update email_replies with AI data
    const { error: updateReplyError } = await supabase
      .from("email_replies")
      .update({
        ai_label: result.label,
        ai_score: result.confidence,
        ai_payload: result,
        reply_kind: result.reply_kind,
        has_meeting_intent: result.has_meeting_intent,
        is_unsubscribe: result.is_unsubscribe,
        is_bounce: result.is_bounce,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reply.id);

    if (updateReplyError) {
      console.error(updateReplyError);
    }

    let leadId: string | null = null;
    let campaignId: string | null = null;

    // 5) Auto-mark send_logs as replied + pull lead_id, campaign_id
    if (reply.send_log_id) {
      // get lead_id, campaign_id from send_logs
      const { data: sendLog } = await supabase
        .from("send_logs")
        .select("id, lead_id, campaign_id")
        .eq("id", reply.send_log_id)
        .single();

      leadId = sendLog?.lead_id ?? null;
      campaignId = sendLog?.campaign_id ?? null;

      // Get workspace_id from lead or campaign if not already set
      if (!workspaceId && leadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("workspace_id")
          .eq("id", leadId)
          .single();
        workspaceId = lead?.workspace_id ?? null;
      }
      if (!workspaceId && campaignId) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("workspace_id")
          .eq("id", campaignId)
          .single();
        workspaceId = campaign?.workspace_id ?? null;
      }

      const { error: updateLogError } = await supabase
        .from("send_logs")
        .update({
          reply_status: "replied",
          reply_label: result.label,
          reply_metadata: result,
          replied_at: new Date().toISOString(),
        })
        .eq("id", reply.send_log_id);

      if (updateLogError) {
        console.error(updateLogError);
      }
    }

    // 6) Update lead-level email_status so future sends are suppressed
    if (leadId) {
      let nextStatus: "active" | "replied" | "unsubscribed" | "bounced" | null = null;

      if (result.is_unsubscribe) {
        nextStatus = "unsubscribed";
      } else if (result.is_bounce) {
        nextStatus = "bounced";
      } else if (
        result.reply_kind === "positive_meeting" ||
        result.reply_kind === "positive_no_meeting" ||
        result.reply_kind === "neutral_question"
      ) {
        nextStatus = "replied";
      }

      if (nextStatus) {
        const { error: updateLeadError } = await supabase
          .from("leads")
          .update({
            email_status: nextStatus,
            last_reply_at: new Date().toISOString(),
            last_reply_kind: result.reply_kind,
          })
          .eq("id", leadId);

        if (updateLeadError) {
          console.error(updateLeadError);
        }

        // Log events for timeline (Block 11200)
        try {
          // Log reply received event
          await supabase.rpc("log_lead_event", {
            p_lead_id: leadId,
            p_type: "reply_received",
            p_content: `Homeowner replied${result.label ? ` (${result.label.toUpperCase()})` : ""}.`,
            p_metadata: {
              reply_text: reply.raw_text?.substring(0, 500),
              subject: reply.subject,
              intent: result.label,
              intent_label: result.label,
              confidence: result.confidence,
              reply_kind: result.reply_kind,
            },
          });

          // Log classification event if intent was detected
          if (result.label && result.label !== "other") {
            await supabase.rpc("log_lead_event", {
              p_lead_id: leadId,
              p_type: "classified",
              p_content: `Lead classified as ${result.label.toUpperCase()}${result.reason ? ` (${result.reason})` : ""}.`,
              p_metadata: {
                intent_label: result.label,
                reason: result.reason,
                confidence: result.confidence,
              },
            });
          }
        } catch (eventError) {
          // Don't fail the reply detection if event logging fails
          console.error("Error logging reply events:", eventError);
        }
      }
    }

    // 7) Auto-mark campaign_leads as replied / stop followups
    const stop_followups = result.reply_kind === "positive_meeting" || 
                           result.reply_kind === "positive_no_meeting" ||
                           result.reply_kind === "neutral_question";
    
    if (campaignId && leadId && workspaceId && stop_followups) {
      await supabase
        .from("campaign_leads")
        .update({
          status: "replied",
          replied_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("campaign_id", campaignId)
        .eq("lead_id", leadId);

      // Log follow-up stopped event (Block 11200)
      if (leadId) {
        try {
          await supabase.rpc("log_lead_event", {
            p_lead_id: leadId,
            p_type: "followup_stopped",
            p_content: `Auto follow-ups paused — homeowner replied.`,
            p_metadata: {
              reason: "homeowner_replied",
              reply_kind: result.reply_kind,
            },
          });
        } catch (eventError) {
          console.error("Error logging follow-up stopped event:", eventError);
        }
      }
    }

    // 8) Create/update reply_logs with AI fields
    const has_meeting_intent = result.has_meeting_intent || false;
    const category = result.reply_kind === "positive_meeting" ? "interested" :
                     result.reply_kind === "positive_no_meeting" ? "interested" :
                     result.reply_kind === "neutral_question" ? "neutral" :
                     result.reply_kind === "unsubscribe" ? "unsubscribe" :
                     result.reply_kind === "bounce" ? "bounce" :
                     result.reply_kind === "ooh" ? "out_of_office" :
                     "unclear";
    const intent = result.label || null;

    // Check if reply_logs entry exists
    const { data: existingReplyLog } = await supabase
      .from("reply_logs")
      .select("id")
      .eq("email_id", reply.id)
      .maybeSingle();

    if (existingReplyLog && workspaceId && leadId) {
      // Update existing reply_logs
      await supabase
        .from("reply_logs")
        .update({
          workspace_id: workspaceId,
          lead_id: leadId,
          campaign_id: campaignId,
          ai_has_meeting: has_meeting_intent,
          ai_category: category,
          confidence: result.confidence || 0,
        })
        .eq("id", existingReplyLog.id);
    } else if (workspaceId && leadId) {
      // Create new reply_logs entry
      await supabase
        .from("reply_logs")
        .insert({
          email_id: reply.id,
          workspace_id: workspaceId,
          lead_id: leadId,
          campaign_id: campaignId,
          type: "reply",
          ai_has_meeting: has_meeting_intent,
          ai_category: category,
          confidence: result.confidence || 0,
        });
    }

    // 9) Apply follow-up rules (workspace/global + campaign specific)
    if (workspaceId && leadId && category) {
      await applyReplyFollowupRules({
        supabase,
        workspaceId,
        campaignId: campaignId || null,
        leadId,
        aiCategory: category,
      });
    }

    // 9.5) Auto-create follow-up task if meeting intent detected
    if (has_meeting_intent && workspaceId && leadId) {
      // Get authenticated user
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;

      if (user) {
        // Get reply_logs id
        const { data: replyLog } = await supabase
          .from("reply_logs")
          .select("id")
          .eq("email_id", reply.id)
          .maybeSingle();

        // Get lead email
        const { data: lead } = await supabase
          .from("leads")
          .select("email")
          .eq("id", leadId)
          .single();

        // Calculate next business day (simple: +1 day)
        const due = new Date();
        due.setDate(due.getDate() + 1);

        // Avoid duplicates: check if task already exists for this reply
        if (replyLog?.id) {
          const { data: existingTask } = await supabase
            .from("tasks")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("lead_id", leadId)
            .eq("reply_id", replyLog.id)
            .eq("status", "open")
            .maybeSingle();

          if (!existingTask) {
            await supabase.from("tasks").insert({
              workspace_id: workspaceId,
              user_id: user.id,
              lead_id: leadId,
              campaign_id: campaignId,
              reply_id: replyLog.id,
              title: `Follow up with ${lead?.email || "lead"} about meeting`,
              notes: intent || null,
              due_at: due.toISOString(),
            });
          }
        }
      }
    }

    // 10) Auto-create meeting opportunity if they show meeting intent
    if (leadId && workspaceId && has_meeting_intent && category !== "bounce" && category !== "out_of_office") {
      // Get reply_logs id for the meeting
      const { data: replyLog } = await supabase
        .from("reply_logs")
        .select("id")
        .eq("email_id", reply.id)
        .maybeSingle();

      // Avoid duplicates: check if there's already a meeting tied to this reply
      const { data: existing } = await supabase
        .from("lead_meetings")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("lead_id", leadId)
        .eq("reply_id", replyLog?.id || "")
        .maybeSingle();

      if (!existing && replyLog?.id) {
        await supabase.from("lead_meetings").insert({
          workspace_id: workspaceId,
          campaign_id: campaignId,
          lead_id: leadId,
          reply_id: replyLog.id,
          title: "Inbound meeting request",
          status: "new",
          notes: intent || null,
        });
      }
    }

    // 11) Optional: log activity
    if (workspaceId) {
      await supabase.from("workspace_activity").insert({
        workspace_id: workspaceId,
        event_type: "reply_classified",
        description: `Reply labeled as ${category} (${intent})`,
        metadata: { reply_id: replyId, category, stop_followups, has_meeting_intent },
        lead_id: leadId,
        campaign_id: campaignId,
      });
    }

    return NextResponse.json({
      ok: true,
      replyId: reply.id,
      sendLogId: reply.send_log_id,
      result,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error", details: (err as Error).message },
      { status: 500 }
    );
  }
}

