/**
 * Storm Outreach Send
 * POST /api/storm/outreach/send
 * Send storm outreach messages to affected leads
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/storm/outreach/send
 * Send storm outreach to affected leads
 * Body: { storm_event_id, method (sms|email|both), script_id (optional) }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();
    const { storm_event_id, method, script_id } = body;

    if (!storm_event_id || !method) {
      return NextResponse.json(
        { error: "Missing required fields: storm_event_id, method" },
        { status: 400 }
      );
    }

    if (!["sms", "email", "both"].includes(method)) {
      return NextResponse.json(
        { error: "Invalid method. Must be: sms, email, or both" },
        { status: 400 }
      );
    }

    // Get storm event
    const { data: stormEvent, error: eventError } = await supabaseAdmin
      .from("storm_events")
      .select("*")
      .eq("id", storm_event_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (eventError || !stormEvent) {
      return NextResponse.json(
        { error: "Storm event not found" },
        { status: 404 }
      );
    }

    // Get affected leads
    const { data: matches, error: matchesError } = await supabaseAdmin
      .from("storm_lead_matches")
      .select(`
        lead_id,
        thread_id,
        leads:lead_id (id, email, phone, first_name, last_name, zip),
        inbox_threads:thread_id (id, campaign_id)
      `)
      .eq("storm_event_id", storm_event_id)
      .eq("workspace_id", workspaceId)
      .eq("outreach_sent", false);

    if (matchesError) {
      console.error("Error fetching storm lead matches:", matchesError);
      return NextResponse.json(
        { error: "Failed to fetch affected leads" },
        { status: 500 }
      );
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json({
        message: "No leads found or all leads already received outreach",
        sent_count: 0,
      });
    }

    // Get script (use default if not provided)
    let script = null;
    if (script_id) {
      const { data: customScript } = await supabaseAdmin
        .from("storm_outreach_scripts")
        .select("*")
        .eq("id", script_id)
        .eq("workspace_id", workspaceId)
        .single();
      
      if (customScript) {
        script = customScript;
      }
    }

    // Use default script if no custom script
    if (!script) {
      const { data: defaultScript } = await supabaseAdmin
        .from("storm_outreach_scripts")
        .select("*")
        .eq("is_default", true)
        .eq("event_type", stormEvent.event_type)
        .eq("intensity", stormEvent.intensity)
        .single();
      
      script = defaultScript;
    }

    if (!script) {
      return NextResponse.json(
        { error: "No outreach script found for this storm type" },
        { status: 404 }
      );
    }

    // Send messages
    const results = [];
    const now = new Date().toISOString();

    for (const match of matches) {
      const lead = match.leads as any;
      const thread = match.inbox_threads as any;

      if (!lead) continue;

      try {
        // Personalize message
        const firstName = lead.first_name || "there";
        let smsMessage = script.sms_template?.replace("{{first_name}}", firstName) || "";
        let emailSubject = script.email_subject?.replace("{{first_name}}", firstName) || "";
        let emailBody = script.email_body?.replace("{{first_name}}", firstName) || "";

        // Send SMS if requested
        if (method === "sms" || method === "both") {
          if (lead.phone) {
            // TODO: Integrate with actual SMS provider
            // For now, just mark as sent
            console.log(`Would send SMS to ${lead.phone}: ${smsMessage}`);
            
            results.push({
              lead_id: lead.id,
              method: "sms",
              success: true,
            });
          }
        }

        // Send Email if requested
        if (method === "email" || method === "both") {
          if (lead.email && thread?.campaign_id) {
            // TODO: Integrate with actual email sending
            // For now, just mark as sent
            console.log(`Would send email to ${lead.email}: ${emailSubject}`);
            
            results.push({
              lead_id: lead.id,
              method: "email",
              success: true,
            });
          }
        }

        // Update storm_lead_matches
        await supabaseAdmin
          .from("storm_lead_matches")
          .update({
            outreach_sent: true,
            outreach_sent_at: now,
            outreach_method: method,
          })
          .eq("storm_event_id", storm_event_id)
          .eq("lead_id", lead.id);

        // Update script usage stats
        await supabaseAdmin
          .from("storm_outreach_scripts")
          .update({
            times_used: (script.times_used || 0) + 1,
            last_used_at: now,
          })
          .eq("id", script.id);

      } catch (error) {
        console.error(`Error sending outreach to lead ${lead.id}:`, error);
        results.push({
          lead_id: lead.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      message: `Outreach sent to ${results.filter((r) => r.success).length} leads`,
      sent_count: results.filter((r) => r.success).length,
      failed_count: results.filter((r) => !r.success).length,
      results,
    });
  } catch (error) {
    console.error("Error in /api/storm/outreach/send:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































