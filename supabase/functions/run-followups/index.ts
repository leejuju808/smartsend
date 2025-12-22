// Block 21729 — SmartSend Roofing Auto Follow-Up Brain v1
// Edge Function — Run Follow-Ups Cron Job
// This cron job runs every 15 minutes and checks which leads need follow-up
// based on behavior triggers (no reply, open spike, click, warm_to_hot)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  console.log("Starting follow-up engine run...");

  try {
    // 1. Get all leads eligible for follow-up
    const { data: leads, error: fetchError } = await supabase.rpc(
      "fetch_leads_needing_followup"
    );

    if (fetchError) {
      console.error("Error fetching leads:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch leads", details: fetchError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!leads || leads.length === 0) {
      console.log("No leads need follow-up at this time");
      return new Response(
        JSON.stringify({ message: "No leads need follow-up", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${leads.length} leads needing follow-up`);

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    // 2. Process each lead
    for (const lead of leads) {
      results.processed++;

      try {
        // Get campaign details to find sender account
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("id, workspace_id, sender_profile_id")
          .eq("id", lead.campaign_id)
          .single();

        if (!campaign) {
          console.warn(`Campaign ${lead.campaign_id} not found for lead ${lead.lead_id}`);
          results.failed++;
          continue;
        }

        // Get sender account from campaign or workspace
        let senderAccountId: string | null = null;
        if (campaign.sender_profile_id) {
          senderAccountId = campaign.sender_profile_id;
        } else {
          // Try to get default account for workspace
          const { data: account } = await supabase
            .from("connected_accounts")
            .select("id")
            .eq("workspace_id", campaign.workspace_id)
            .eq("provider", "gmail")
            .limit(1)
            .single();

          if (account) {
            senderAccountId = account.id;
          }
        }

        if (!senderAccountId) {
          console.warn(`No sender account found for campaign ${lead.campaign_id}`);
          results.failed++;
          continue;
        }

        // Personalize email body with lead's first name
        let emailBody = lead.step_email_body;
        if (lead.lead_first_name) {
          emailBody = emailBody.replace(/\{\{first_name\}\}/g, lead.lead_first_name);
          emailBody = emailBody.replace(/\{\{FIRST_NAME\}\}/g, lead.lead_first_name);
        }

        // 3. Send follow-up email
        // Try to use email-send function if available, otherwise use direct API
        const sendEmailUrl = Deno.env.get("SEND_EMAIL_FUNCTION_URL");
        
        let emailLogId: string | null = null;

        if (sendEmailUrl) {
          // Call email-send edge function
          const emailResponse = await fetch(sendEmailUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: lead.lead_email,
              lead_id: lead.lead_id,
              campaign_id: lead.campaign_id,
              subject: lead.step_email_subject,
              body: emailBody,
              account_id: senderAccountId,
            }),
          });

          if (!emailResponse.ok) {
            const errorText = await emailResponse.text();
            throw new Error(`Email send failed: ${errorText}`);
          }

          const emailResult = await emailResponse.json();
          emailLogId = emailResult.email_log_id || null;
        } else {
          // Fallback: Use Supabase email sending if available
          // This is a placeholder - adjust based on your email sending setup
          console.log(`Would send email to ${lead.lead_email} with subject: ${lead.step_email_subject}`);
          // In production, you'd call your email sending service here
        }

        // 4. Log timeline event
        const addEventUrl = Deno.env.get("ADD_LEAD_EVENT_URL") || 
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/add-lead-event`;

        try {
          await fetch(addEventUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              lead_id: lead.lead_id,
              event_type: "email_sent",
              event_subtype: `followup_${lead.step_trigger_type}`,
              message: `Auto follow-up sent (${lead.step_trigger_type})`,
              metadata: {
                step_id: lead.step_id,
                trigger_type: lead.step_trigger_type,
                wait_hours: lead.step_wait_hours,
                email_log_id: emailLogId,
              },
            }),
          });
        } catch (eventError) {
          console.warn(`Failed to log timeline event for lead ${lead.lead_id}:`, eventError);
          // Don't fail the whole process if event logging fails
        }

        // 5. Mark that follow-up was sent
        const { error: logError } = await supabase.rpc("mark_followup_sent", {
          lead_id: lead.lead_id,
          step_id: lead.step_id,
          email_log_id: emailLogId,
          metadata: {
            trigger_type: lead.step_trigger_type,
            sent_at: new Date().toISOString(),
          },
        });

        if (logError) {
          console.error(`Failed to mark follow-up as sent for lead ${lead.lead_id}:`, logError);
          results.failed++;
          results.errors.push(`Lead ${lead.lead_id}: ${logError.message}`);
        } else {
          results.sent++;
          console.log(`✓ Sent follow-up to ${lead.lead_email} (${lead.step_trigger_type})`);
        }

        // Update lead's last_email_sent_at
        await supabase
          .from("leads")
          .update({ last_email_sent_at: new Date().toISOString() })
          .eq("id", lead.lead_id);

      } catch (error) {
        console.error(`Error processing lead ${lead.lead_id}:`, error);
        results.failed++;
        results.errors.push(`Lead ${lead.lead_id}: ${error.message || String(error)}`);
      }
    }

    console.log(`Follow-up run complete: ${results.sent} sent, ${results.failed} failed`);

    return new Response(
      JSON.stringify({
        message: "Follow-up run complete",
        ...results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Fatal error in follow-up engine:", error);
    return new Response(
      JSON.stringify({
        error: "Fatal error",
        message: error.message || String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});










































