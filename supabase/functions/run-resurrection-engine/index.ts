// Block 21790 — SmartSend Roofing Lead Resurrection Engine v1
// 🧟‍♂️ Bring Dead Leads Back to Life
// Edge function to automatically re-engage dead/cold leads

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  // Allow POST and GET (GET for cron triggers)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    console.log("Starting Lead Resurrection Engine...");

    // Fetch all leads that might need resurrection
    // Filter out hot leads, won/lost leads, and unsubscribed/bounced upfront
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(`
        id,
        workspace_id,
        email,
        first_name,
        last_name,
        heat_category,
        heat_score,
        last_reply_at,
        first_reply_at,
        pipeline_stage,
        status,
        created_at,
        last_resurrection_at,
        resurrection_count
      `)
      .not("email", "is", null)
      .neq("heat_category", "hot")
      .not("status", "in", "(won,lost,unsubscribed,bounced)")
      .not("pipeline_stage", "in", "(won,lost)");

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      throw leadsError;
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: "No leads to process",
          processed: 0,
          resurrected: 0
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${leads.length} leads...`);

    // Group leads by workspace to batch settings lookups
    const workspaceIds = [...new Set(leads.map(l => l.workspace_id))];
    const settingsMap = new Map<string, any>();

    // Fetch automation settings for all workspaces
    for (const workspaceId of workspaceIds) {
      const { data: settings } = await supabase
        .from("automation_settings")
        .select("resurrect_never_replied, resurrect_ghosted, resurrect_past_customers, resurrection_cooldown_days")
        .eq("workspace_id", workspaceId)
        .single();
      
      // Use defaults if settings don't exist
      settingsMap.set(workspaceId, settings || {
        resurrect_never_replied: true,
        resurrect_ghosted: true,
        resurrect_past_customers: false,
        resurrection_cooldown_days: 30
      });
    }

    const now = new Date();
    let processed = 0;
    let resurrected = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const settings = settingsMap.get(lead.workspace_id) || {
          resurrect_never_replied: true,
          resurrect_ghosted: true,
          resurrect_past_customers: false,
          resurrection_cooldown_days: 30
        };

        // Skip active/hot leads
        if (lead.heat_category === "hot") {
          continue;
        }

        // Check resurrection type and if it's enabled
        const { data: resurrectionType, error: typeError } = await supabase
          .rpc("determine_resurrection_type", { p_lead_id: lead.id });

        if (typeError) {
          console.error(`Error determining resurrection type for lead ${lead.id}:`, typeError);
          errors.push(`Lead ${lead.id}: ${typeError.message}`);
          continue;
        }

        if (!resurrectionType) {
          continue;
        }

        // Check if this resurrection type is enabled
        if (resurrectionType === "no_reply" && !settings.resurrect_never_replied) {
          continue;
        }
        if (resurrectionType === "ghosted" && !settings.resurrect_ghosted) {
          continue;
        }
        if (resurrectionType === "seasonal_revival" && !settings.resurrect_past_customers) {
          continue;
        }

        // Check cooldown period
        if (lead.last_resurrection_at) {
          const daysSinceLastResurrection = Math.floor(
            (now.getTime() - new Date(lead.last_resurrection_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceLastResurrection < settings.resurrection_cooldown_days) {
            continue;
          }
        }

        // Check if lead can be resurrected using database function
        const { data: canResurrect, error: checkError } = await supabase
          .rpc("can_resurrect_lead", { p_lead_id: lead.id });

        if (checkError) {
          console.error(`Error checking resurrection eligibility for lead ${lead.id}:`, checkError);
          errors.push(`Lead ${lead.id}: ${checkError.message}`);
          continue;
        }

        if (!canResurrect) {
          continue;
        }

        // Generate resurrection message
        const message = generateResurrectionMessage(lead, resurrectionType);
        const subject = getResurrectionSubject(resurrectionType);

        // Get workspace/org info for sending
        const workspaceId = lead.workspace_id;
        if (!workspaceId) {
          console.error(`Lead ${lead.id} has no workspace_id`);
          errors.push(`Lead ${lead.id}: Missing workspace_id`);
          continue;
        }

        // Insert into send_queue for reliable delivery
        const { data: queueItem, error: queueError } = await supabase
          .from("send_queue")
          .insert({
            workspace_id: workspaceId,
            lead_id: lead.id,
            status: "queued",
            scheduled_at: new Date().toISOString(),
            payload: {
              subject: subject,
              body: message,
              body_text: message,
              resurrection_type: resurrectionType,
              automated: true,
              source: "resurrection_engine"
            }
          })
          .select("id")
          .single();

        if (queueError) {
          console.error(`Error queueing resurrection message for lead ${lead.id}:`, queueError);
          errors.push(`Lead ${lead.id}: ${queueError.message}`);
          continue;
        }

        // Also create channel_message record for tracking
        const { data: messageRecord, error: messageError } = await supabase
          .from("channel_messages")
          .insert({
            lead_id: lead.id,
            org_id: workspaceId,
            channel: "email",
            direction: "outbound",
            body: message,
            subject: subject,
            status: "pending",
            metadata: {
              resurrection_type: resurrectionType,
              automated: true,
              source: "resurrection_engine",
              queue_id: queueItem?.id
            }
          })
          .select("id")
          .single();

        if (messageError) {
          console.error(`Error creating channel_message for lead ${lead.id}:`, messageError);
          // Don't fail - queue item was created successfully
        }

        // Log resurrection record
        const { error: resurrectionError } = await supabase
          .from("lead_resurrections")
          .insert({
            lead_id: lead.id,
            resurrection_type: resurrectionType,
            sent_at: now.toISOString(),
            status: "sent",
            message_body: message
          });

        if (resurrectionError) {
          console.error(`Error logging resurrection for lead ${lead.id}:`, resurrectionError);
          errors.push(`Lead ${lead.id}: ${resurrectionError.message}`);
        }

        // Update lead resurrection tracking
        const { error: updateError } = await supabase
          .from("leads")
          .update({
            last_resurrection_at: now.toISOString(),
            resurrection_count: (lead.resurrection_count || 0) + 1
          })
          .eq("id", lead.id);

        if (updateError) {
          console.error(`Error updating lead ${lead.id}:`, updateError);
          errors.push(`Lead ${lead.id}: ${updateError.message}`);
        }

        // Log timeline event
        const { error: timelineError } = await supabase
          .from("lead_timeline_events")
          .insert({
            lead_id: lead.id,
            event_type: "resurrection_triggered",
            event_subtype: resurrectionType,
            message: `SmartSend attempted to revive this lead via: ${resurrectionType}`,
            metadata: {
              resurrection_type: resurrectionType,
              message_id: messageRecord?.id
            }
          });

        if (timelineError) {
          console.error(`Error logging timeline event for lead ${lead.id}:`, timelineError);
          // Don't fail the whole process for timeline errors
        }

        resurrected++;
        processed++;

        console.log(`Resurrected lead ${lead.id} (${lead.email}) with type: ${resurrectionType}`);

      } catch (error) {
        console.error(`Error processing lead ${lead.id}:`, error);
        errors.push(`Lead ${lead.id}: ${error instanceof Error ? error.message : String(error)}`);
        processed++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Resurrection engine completed. Processed ${processed} leads, resurrected ${resurrected}.`,
        processed,
        resurrected,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in resurrection engine:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
});

function generateResurrectionMessage(lead: any, resurrectionType: string): string {
  const firstName = lead.first_name || "there";
  
  switch (resurrectionType) {
    case "no_reply":
      return `Hey ${firstName}, just circling back — are you still needing help with your roof?`;
    
    case "ghosted":
      return `Totally understand things get busy — want me to get you back on the schedule?`;
    
    case "estimate_not_booked":
      return `Want me to locate the next available opening for you?`;
    
    case "proposal_unanswered":
      return `Any questions about the quote? Happy to help.`;
    
    case "warm_cooled":
      return `Just checking back in — want me to get you on the schedule?`;
    
    case "seasonal_revival":
      return `With the weather changing, now's a great time to get your roof checked — want a free look?`;
    
    case "generic_reengagement":
    default:
      return `Still here if you need anything done with your roof!`;
  }
}

function getResurrectionSubject(resurrectionType: string): string {
  switch (resurrectionType) {
    case "no_reply":
      return "Quick follow-up";
    case "ghosted":
      return "Just checking back in";
    case "estimate_not_booked":
      return "Still need that estimate?";
    case "proposal_unanswered":
      return "Any questions about your quote?";
    case "warm_cooled":
      return "Want to get back on the schedule?";
    case "seasonal_revival":
      return "Great time for a roof check";
    case "generic_reengagement":
    default:
      return "Still here if you need anything";
  }
}

