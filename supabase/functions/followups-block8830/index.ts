// supabase/functions/followups-block8830/index.ts
// Block 8830 — Follow-Up Engine v1 (Auto-Send Step 2 + Step 3 When Homeowner Doesn't Reply)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logActivity } from "../_shared/activity-log.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (_req) => {
  try {
    // 1. Find pending follow-ups using RPC
    const { data: pending, error: rpcError } = await supabase.rpc("get_pending_followups");

    if (rpcError) {
      console.error("Follow-up RPC error:", rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ executed: 0, message: "No pending follow-ups" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    let sentCount = 0;
    let errorCount = 0;

    // 2. Process each pending follow-up
    for (const item of pending) {
      try {
        const step = item.next_step; // 2 or 3

        // Get follow-up template
        const { data: tmpl, error: tmplError } = await supabase
          .from("campaign_followups")
          .select("subject, body, wait_days")
          .eq("campaign_id", item.campaign_id)
          .eq("step", step)
          .maybeSingle();

        if (tmplError || !tmpl) {
          console.error(`Template not found for campaign ${item.campaign_id}, step ${step}`);
          errorCount++;
          continue;
        }

        // Get campaign details for sending account
        const { data: campaign, error: campaignError } = await supabase
          .from("campaigns")
          .select("id, workspace_id, owner_id, from_email_account_id")
          .eq("id", item.campaign_id)
          .maybeSingle();

        if (campaignError || !campaign) {
          console.error(`Campaign not found: ${item.campaign_id}`);
          errorCount++;
          continue;
        }

        // Get sending account - try from_email_account_id first, then workspace default
        let accountId = campaign.from_email_account_id;
        
        if (!accountId) {
          // Try to get a default account for the workspace
          const { data: defaultAccount } = await supabase
            .from("connected_accounts")
            .select("id")
            .eq("workspace_id", campaign.workspace_id)
            .limit(1)
            .maybeSingle();
          
          if (defaultAccount) {
            accountId = defaultAccount.id;
          } else {
            console.error(`No sending account for campaign ${item.campaign_id}`);
            errorCount++;
            continue;
          }
        }

        // Get account details
        const { data: account, error: accountError } = await supabase
          .from("connected_accounts")
          .select("id, provider, email")
          .eq("id", accountId)
          .maybeSingle();

        if (accountError || !account) {
          console.error(`Account not found: ${accountId}`);
          errorCount++;
          continue;
        }

        // Send email via send-email edge function
        const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-email", {
          body: {
            account_id: accountId,
            to: item.email,
            subject: tmpl.subject,
            html: tmpl.body,
          },
        });

        if (sendError || !sendResult?.ok) {
          console.error(`Failed to send email to ${item.email}:`, sendError || sendResult);
          errorCount++;
          continue;
        }

        // Mark follow-up as sent in outbound_emails
        const { error: insertError } = await supabase.from("outbound_emails").insert({
          owner_id: item.owner_id,
          campaign_id: item.campaign_id,
          lead_id: item.lead_id,
          step: step,
          to_email: item.email,
          subject: tmpl.subject,
          body: tmpl.body,
          body_text: tmpl.body,
          status: "sent",
          sent_at: new Date().toISOString(),
          workspace_id: campaign.workspace_id,
        });

        if (insertError) {
          console.error(`Failed to log outbound email:`, insertError);
          // Don't increment errorCount here - email was sent, just logging failed
        }

        // Update lead's last_sent_at
        await supabase
          .from("leads")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", item.lead_id);

        // Log follow-up activity
        try {
          const { data: lead } = await supabase
            .from("leads")
            .select("email, first_name, last_name")
            .eq("id", item.lead_id)
            .maybeSingle();

          await logActivity(supabase, {
            workspace_id: campaign.workspace_id,
            user_id: item.owner_id,
            campaign_id: item.campaign_id,
            lead_id: item.lead_id,
            type: "followup_triggered",
            metadata: {
              to_email: item.email,
              to_name: lead?.first_name || lead?.last_name
                ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
                : null,
              followup_number: step,
              days_since_last: tmpl.wait_days,
            },
          });
        } catch (logError) {
          console.warn("Failed to log follow-up activity:", logError);
        }

        sentCount++;
      } catch (itemError) {
        console.error(`Error processing follow-up for lead ${item.lead_id}:`, itemError);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        executed: pending.length,
        sent: sentCount,
        errors: errorCount,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Follow-up cron error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});

