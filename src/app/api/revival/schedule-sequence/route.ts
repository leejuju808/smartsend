// Block 35333 — Schedule Revival Sequence
// Automatically schedules revival messages for dead leads based on sequence level

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, leadId, sequenceLevel = 1 } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get dead leads that need revival sequences
    let query = supabase
      .from("dead_leads_view")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "dead");

    if (leadId) {
      query = query.eq("id", leadId);
    } else {
      // Only get leads that haven't received this sequence level yet
      const { data: existingSequences } = await supabase
        .from("revival_sequences")
        .select("lead_id, sequence_level")
        .eq("workspace_id", workspaceId)
        .eq("sequence_level", sequenceLevel);

      const excludedLeadIds = new Set(
        existingSequences?.map((s) => s.lead_id) || []
      );

      if (excludedLeadIds.size > 0) {
        query = query.not("id", "in", `(${Array.from(excludedLeadIds).join(",")})`);
      }

      // Limit to top 50 by revival score
      query = query.order("revival_score", { ascending: false, nullsLast: true }).limit(50);
    }

    const { data: deadLeads, error: leadsError } = await query;

    if (leadsError) {
      console.error("Error fetching dead leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch dead leads", details: leadsError.message },
        { status: 500 }
      );
    }

    if (!deadLeads || deadLeads.length === 0) {
      return NextResponse.json({
        message: "No leads need revival sequences",
        scheduled: 0,
      });
    }

    // Calculate send times based on sequence level
    // Level 1: Immediate
    // Level 2: 7 days after Level 1
    // Level 3: 14 days after Level 1
    // Level 4: 30 days after Level 1
    const delayDays: Record<number, number> = {
      1: 0,
      2: 7,
      3: 14,
      4: 30,
    };

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + (delayDays[sequenceLevel] || 0));

    // Create revival sequences for each lead
    const sequences = deadLeads.map((lead: any) => ({
      lead_id: lead.id,
      workspace_id: workspaceId,
      sequence_level: sequenceLevel,
      message: "", // Will be generated when sent
      channel: lead.phone ? "sms" : "email",
      status: "scheduled",
      sent_at: null,
    }));

    // Check if we should send immediately (level 1) or schedule
    if (sequenceLevel === 1) {
      // Send immediately by calling send-message endpoint
      const sendPromises = deadLeads.map((lead: any) =>
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/revival/send-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            workspaceId,
            sequenceLevel: 1,
            channel: lead.phone ? "sms" : "email",
          }),
        })
      );

      const results = await Promise.allSettled(sendPromises);
      const successful = results.filter((r) => r.status === "fulfilled").length;

      return NextResponse.json({
        message: "Revival messages sent",
        scheduled: successful,
        total: deadLeads.length,
      });
    } else {
      // Schedule for later
      const { data: inserted, error: insertError } = await supabase
        .from("revival_sequences")
        .insert(sequences)
        .select();

      if (insertError) {
        console.error("Error scheduling sequences:", insertError);
        return NextResponse.json(
          { error: "Failed to schedule sequences", details: insertError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: "Revival sequences scheduled",
        scheduled: inserted?.length || 0,
        scheduledAt: scheduledAt.toISOString(),
      });
    }
  } catch (error: any) {
    console.error("Error scheduling revival sequence:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
































