import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting auto-follow-up scheduler...");

    // 1. Fetch all enabled follow-up programs
    const { data: programs, error: programsError } = await supabase
      .from("follow_up_programs")
      .select("*")
      .eq("is_enabled", true);

    if (programsError) {
      throw new Error(`Failed to fetch programs: ${programsError.message}`);
    }

    if (!programs || programs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No enabled follow-up programs found",
          scheduled_count: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    let totalScheduled = 0;
    const results: any[] = [];

    // 2. Process each program
    for (const program of programs) {
      console.log(`Processing program ${program.id} for campaign ${program.campaign_id}`);

      // Get campaign to check if it's paused
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id, status, account_id")
        .eq("id", program.campaign_id)
        .single();

      if (!campaign) {
        console.log(`Campaign ${program.campaign_id} not found, skipping`);
        continue;
      }

      // Skip if campaign is paused
      if (campaign.status === "paused" || campaign.status === "archived") {
        console.log(`Campaign ${program.campaign_id} is paused/archived, skipping`);
        continue;
      }

      // 3. Load no-reply rules for this program
      const { data: rules, error: rulesError } = await supabase
        .from("follow_up_rules")
        .select("*")
        .eq("program_id", program.id)
        .eq("type", "no_reply")
        .eq("is_enabled", true)
        .order("no_reply_after_days", { ascending: true });

      if (rulesError) {
        console.error(`Failed to fetch rules for program ${program.id}:`, rulesError);
        continue;
      }

      if (!rules || rules.length === 0) {
        console.log(`No no-reply rules found for program ${program.id}`);
        continue;
      }

      // 4. Get all campaign contacts (leads enrolled in this campaign)
      // We need to get contacts that are enrolled in this campaign
      const { data: campaignContacts, error: contactsError } = await supabase
        .from("campaign_contacts")
        .select("contact_id")
        .eq("campaign_id", program.campaign_id);

      if (contactsError) {
        console.error(`Failed to fetch campaign contacts:`, contactsError);
        continue;
      }

      if (!campaignContacts || campaignContacts.length === 0) {
        console.log(`No contacts found for campaign ${program.campaign_id}`);
        continue;
      }

      const contactIds = campaignContacts.map((cc) => cc.contact_id).filter(Boolean);

      // 5. Process each contact
      for (const contactId of contactIds) {
        // Get or create stats record
        const { data: stats, error: statsError } = await supabase
          .from("lead_auto_follow_up_stats")
          .select("*")
          .eq("campaign_id", program.campaign_id)
          .eq("contact_id", contactId)
          .maybeSingle();

        if (statsError) {
          console.error(`Failed to fetch stats for contact ${contactId}:`, statsError);
          continue;
        }

        // Check if follow-ups are disabled
        if (stats?.auto_follow_up_disabled) {
          continue;
        }

        // Check if we've hit the cap
        if (stats && stats.auto_follow_ups_sent >= program.max_follow_ups_per_lead) {
          await supabase.from("follow_up_events").insert({
            account_id: program.account_id,
            campaign_id: program.campaign_id,
            contact_id: contactId,
            rule_id: null,
            event_type: "skipped_due_to_cap",
            details: {
              auto_follow_ups_sent: stats.auto_follow_ups_sent,
              max_follow_ups_per_lead: program.max_follow_ups_per_lead,
            },
          });
          continue;
        }

        // Check if contact is suppressed
        const { data: isSuppressed } = await supabase.rpc("is_contact_suppressed", {
          p_account_id: program.account_id,
          p_campaign_id: program.campaign_id,
          p_contact_id: contactId,
        });

        if (isSuppressed) {
          await supabase.from("follow_up_events").insert({
            account_id: program.account_id,
            campaign_id: program.campaign_id,
            contact_id: contactId,
            rule_id: null,
            event_type: "skipped_due_to_suppression",
            details: {},
          });
          continue;
        }

        // Get last outbound and inbound times
        const { data: lastOutbound } = await supabase.rpc("get_last_outbound_time", {
          p_contact_id: contactId,
          p_campaign_id: program.campaign_id,
        });

        const { data: lastInbound } = await supabase.rpc("get_last_inbound_time", {
          p_contact_id: contactId,
          p_campaign_id: program.campaign_id,
        });

        // Skip if no outbound message yet
        if (!lastOutbound) {
          continue;
        }

        // Skip if there's been a reply after the last outbound
        if (lastInbound && lastInbound > lastOutbound) {
          continue;
        }

        // Calculate days since last outbound
        const daysSinceOutbound = Math.floor(
          (Date.now() - new Date(lastOutbound).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Find matching rule
        const matchingRule = rules.find(
          (rule) => rule.no_reply_after_days && daysSinceOutbound >= rule.no_reply_after_days
        );

        if (!matchingRule || !matchingRule.follow_up_template_id) {
          continue;
        }

        // Check if we've already sent a follow-up for this rule
        const { data: existingEvent } = await supabase
          .from("follow_up_events")
          .select("id")
          .eq("campaign_id", program.campaign_id)
          .eq("contact_id", contactId)
          .eq("rule_id", matchingRule.id)
          .eq("event_type", "scheduled_follow_up")
          .maybeSingle();

        if (existingEvent) {
          continue; // Already scheduled for this rule
        }

        // Get template
        const { data: template, error: templateError } = await supabase
          .from("email_templates")
          .select("*")
          .eq("id", matchingRule.follow_up_template_id)
          .single();

        if (templateError || !template) {
          console.error(`Template ${matchingRule.follow_up_template_id} not found`);
          continue;
        }

        // Get contact details
        const { data: contact, error: contactError } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", contactId)
          .single();

        if (contactError || !contact) {
          console.error(`Contact ${contactId} not found`);
          continue;
        }

        // Enqueue follow-up email to send_queue or outbound_emails
        // Try outbound_emails first, fallback to send_queue
        const emailData = {
          account_id: program.account_id,
          campaign_id: program.campaign_id,
          contact_id: contactId,
          to_email: contact.email,
          subject: template.subject || "Follow-up",
          body: template.body || template.body_html || "",
          body_html: template.body_html || template.body || "",
          scheduled_at: new Date().toISOString(),
          status: "pending",
        };

        // Try to insert into outbound_emails
        const { error: outboundError } = await supabase
          .from("outbound_emails")
          .insert(emailData);

        if (outboundError) {
          // Fallback to send_queue
          const { error: queueError } = await supabase.from("send_queue").insert({
            ...emailData,
            workspace_id: campaign.account_id, // May need adjustment based on schema
          });

          if (queueError) {
            console.error(`Failed to enqueue follow-up email:`, queueError);
            continue;
          }
        }

        // Update stats
        const statsUpdate: any = {
          account_id: program.account_id,
          campaign_id: program.campaign_id,
          contact_id: contactId,
          auto_follow_ups_sent: (stats?.auto_follow_ups_sent || 0) + 1,
          last_auto_follow_up_at: new Date().toISOString(),
          last_outbound_at: lastOutbound,
          last_inbound_at: lastInbound || null,
        };

        if (!stats) {
          await supabase.from("lead_auto_follow_up_stats").insert(statsUpdate);
        } else {
          await supabase
            .from("lead_auto_follow_up_stats")
            .update(statsUpdate)
            .eq("id", stats.id);
        }

        // Log event
        await supabase.from("follow_up_events").insert({
          account_id: program.account_id,
          campaign_id: program.campaign_id,
          contact_id: contactId,
          rule_id: matchingRule.id,
          event_type: "scheduled_follow_up",
          details: {
            days_since_outbound: daysSinceOutbound,
            template_id: matchingRule.follow_up_template_id,
            follow_up_number: (stats?.auto_follow_ups_sent || 0) + 1,
          },
        });

        totalScheduled++;
        results.push({
          program_id: program.id,
          campaign_id: program.campaign_id,
          contact_id: contactId,
          rule_id: matchingRule.id,
          days_since_outbound: daysSinceOutbound,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-follow-up scheduler completed. ${totalScheduled} follow-ups scheduled.`,
        scheduled_count: totalScheduled,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in auto-follow-up scheduler:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
























































