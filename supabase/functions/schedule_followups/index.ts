import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface FollowupConfig {
  day_offset: number;
  subject?: string;
  body_text?: string;
  body_html?: string;
}

serve(async (req) => {
  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    const cronToken = req.headers.get("x-cron-token");
    if (!authHeader && cronToken !== Deno.env.get("CRON_SECRET")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // Process 1: Send due follow-ups
    const now = new Date().toISOString();
    const { data: dueFollowups, error: dueError } = await supabase
      .from("followup_schedules")
      .select(`
        id,
        campaign_id,
        lead_id,
        org_id,
        subject,
        body_text,
        body_html,
        sequence_step
      `)
      .eq("status", "scheduled")
      .lte("send_at", now)
      .limit(50);

    if (dueError) {
      console.error("Error fetching due follow-ups:", dueError);
      return new Response(JSON.stringify({ error: dueError.message }), { status: 500 });
    }

    const sentCount = 0;
    const skippedCount = 0;

    if (dueFollowups && dueFollowups.length > 0) {
      for (const followup of dueFollowups) {
        try {
          // Check if lead has replied (skip if so)
          const { data: thread } = await supabase
            .from("email_threads")
            .select("id, status")
            .eq("lead_email", followup.lead_id) // Note: may need to join with leads table
            .eq("status", "replied")
            .limit(1)
            .maybeSingle();

          if (thread) {
            // Lead replied, skip this follow-up
            await supabase
              .from("followup_schedules")
              .update({
                status: "skipped",
                skipped_reason: "replied",
                updated_at: now
              })
              .eq("id", followup.id);

            skippedCount++;
            continue;
          }

          // Check if lead unsubscribed
          const { data: lead } = await supabase
            .from("leads")
            .select("status")
            .eq("id", followup.lead_id)
            .maybeSingle();

          if (lead?.status === "unsubscribed") {
            await supabase
              .from("followup_schedules")
              .update({
                status: "skipped",
                skipped_reason: "unsubscribed",
                updated_at: now
              })
              .eq("id", followup.id);

            skippedCount++;
            continue;
          }

          // Get campaign template if body not provided
          let emailSubject = followup.subject;
          let emailBody = followup.body_text;
          let emailBodyHtml = followup.body_html;

          if (!emailBody) {
            const { data: campaign } = await supabase
              .from("campaigns")
              .select("subject, body_template")
              .eq("id", followup.campaign_id)
              .maybeSingle();

            if (campaign) {
              emailSubject = emailSubject || `Re: ${campaign.subject}`;
              emailBody = campaign.body_template || "";
            }
          }

          // TODO: Actually send the email via your email provider
          // For now, we'll create an email_log entry and mark as sent
          const { data: emailLog } = await supabase
            .from("email_logs")
            .insert({
              campaign_id: followup.campaign_id,
              lead_id: followup.lead_id,
              subject: emailSubject || "Follow-up",
              body_text: emailBody,
              body_html: emailBodyHtml,
              status: "sent",
              sent_at: now
            })
            .select()
            .single();

          // Mark follow-up as sent
          await supabase
            .from("followup_schedules")
            .update({
              status: "sent",
              email_log_id: emailLog?.id,
              sent_at: now,
              updated_at: now
            })
            .eq("id", followup.id);

          sentCount++;

          // Create notification
          await supabase.from("notifications").insert({
            user_id: followup.org_id, // May need actual user_id
            org_id: followup.org_id,
            type: "followup_sent",
            severity: "info",
            title: "Follow-up sent",
            message: `Follow-up #${followup.sequence_step} sent`,
            action_url: `/dashboard/campaigns/${followup.campaign_id}`,
            sent_email: false,
            metadata: {
              campaign_id: followup.campaign_id,
              lead_id: followup.lead_id,
              sequence_step: followup.sequence_step
            }
          });

        } catch (error) {
          console.error(`Error processing follow-up ${followup.id}:`, error);
          continue;
        }
      }
    }

    // Process 2: Schedule new follow-ups for campaigns with no replies
    // This looks for email_logs that were sent X days ago with no replies
    const followupConfigs: FollowupConfig[] = [
      { day_offset: 3 },  // First follow-up after 3 days
      { day_offset: 7 },  // Second follow-up after 7 days
      { day_offset: 14 }  // Third follow-up after 14 days
    ];

    const { data: recentSends, error: sendsError } = await supabase
      .from("email_logs")
      .select(`
        id,
        campaign_id,
        lead_id,
        sent_at,
        status,
        subject
      `)
      .eq("status", "sent")
      .not("replied_at", "is", null)
      .gte("sent_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()) // Last 14 days
      .limit(100);

    if (!sendsError && recentSends) {
      for (const emailLog of recentSends) {
        try {
          // Get org_id from campaign
          const { data: campaign } = await supabase
            .from("campaigns")
            .select("org_id, user_id")
            .eq("id", emailLog.campaign_id)
            .maybeSingle();

          if (!campaign) continue;

          // Check existing follow-ups for this lead/campaign
          const { data: existingFollowups } = await supabase
            .from("followup_schedules")
            .select("sequence_step")
            .eq("campaign_id", emailLog.campaign_id)
            .eq("lead_id", emailLog.lead_id);

          const existingSteps = new Set(existingFollowups?.map(f => f.sequence_step) || []);

          // Schedule missing follow-ups
          for (const config of followupConfigs) {
            if (existingSteps.has(config.day_offset)) continue; // Already scheduled

            const sendDate = new Date(new Date(emailLog.sent_at).getTime() + config.day_offset * 24 * 60 * 60 * 1000);

            // Don't schedule if date is in the past
            if (sendDate < new Date()) continue;

            await supabase
              .from("followup_schedules")
              .insert({
                org_id: campaign.org_id || campaign.user_id,
                campaign_id: emailLog.campaign_id,
                lead_id: emailLog.lead_id,
                sequence_step: config.day_offset === 3 ? 1 : config.day_offset === 7 ? 2 : 3,
                day_offset: config.day_offset,
                send_at: sendDate.toISOString(),
                subject: `Re: ${emailLog.subject || ""}`,
                status: "scheduled"
              });
          }

        } catch (error) {
          console.error(`Error scheduling follow-ups for email_log ${emailLog.id}:`, error);
          continue;
        }
      }
    }

    return new Response(
      JSON.stringify({
        processed: {
          sent: sentCount,
          skipped: skippedCount,
          scheduled: recentSends?.length || 0
        },
        message: "Follow-up processing complete"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in schedule_followups function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
});

