// Block 35333 — Storm-Triggered Revival
// Automatically revives dead leads when storm detected in their area

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, zipCode, stormType = "hail" } = await req.json();

    if (!workspaceId || !zipCode) {
      return NextResponse.json(
        { error: "workspaceId and zipCode are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find all dead leads in this ZIP code
    const { data: deadLeads, error: leadsError } = await supabase
      .from("dead_leads_view")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "dead")
      .eq("zip_code", zipCode);

    if (leadsError) {
      console.error("Error fetching dead leads for storm:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads", details: leadsError.message },
        { status: 500 }
      );
    }

    if (!deadLeads || deadLeads.length === 0) {
      return NextResponse.json({
        message: "No dead leads found in this ZIP code",
        processed: 0,
      });
    }

    let processed = 0;
    const errors: any[] = [];

    // Create revival events and send storm-triggered messages
    for (const lead of deadLeads) {
      try {
        // Create storm revival event
        const { data: event, error: eventError } = await supabase
          .from("revival_events")
          .insert({
            lead_id: lead.id,
            workspace_id: workspaceId,
            trigger_type: "storm",
            details: {
              storm_type: stormType,
              zip_code: zipCode,
              triggered_at: new Date().toISOString(),
            },
          })
          .select()
          .single();

        if (eventError) {
          errors.push({ lead_id: lead.id, error: eventError.message });
          continue;
        }

        // Generate storm-specific message
        const message = `There was ${stormType} reported near your home today — want a free roof check while we're in the area?`;

        // Send SMS if phone exists
        if (lead.phone) {
          const sendResponse = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/revival/send-message`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                leadId: lead.id,
                workspaceId,
                sequenceLevel: 1,
                channel: "sms",
              }),
            }
          );

          if (sendResponse.ok) {
            processed++;
          } else {
            errors.push({
              lead_id: lead.id,
              error: "Failed to send message",
            });
          }
        } else {
          // Lead has no phone, skip for now (could send email instead)
          errors.push({
            lead_id: lead.id,
            error: "No phone number available",
          });
        }
      } catch (err: any) {
        errors.push({ lead_id: lead.id, error: err.message });
      }
    }

    return NextResponse.json({
      message: "Storm-triggered revival processed",
      processed,
      total: deadLeads.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in storm-triggered revival:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
































