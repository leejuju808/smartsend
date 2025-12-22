// Block 35333 — Proposal Update Auto-Prompt
// Sends message to leads with proposals 60+ days old offering updated quote

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find leads with proposals 60+ days old
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: leadsWithOldProposals, error: leadsError } = await supabase
      .from("dead_leads_view")
      .select("*")
      .eq("workspace_id", workspaceId)
      .not("proposal_sent_at", "is", null)
      .lt("proposal_sent_at", sixtyDaysAgo.toISOString());

    if (leadsError) {
      console.error("Error fetching leads with old proposals:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads", details: leadsError.message },
        { status: 500 }
      );
    }

    if (!leadsWithOldProposals || leadsWithOldProposals.length === 0) {
      return NextResponse.json({
        message: "No leads with old proposals found",
        processed: 0,
      });
    }

    let processed = 0;
    const errors: any[] = [];

    for (const lead of leadsWithOldProposals) {
      try {
        // Check if we already sent a proposal update message
        const { data: existingSequence } = await supabase
          .from("revival_sequences")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("sequence_level", 2) // Level 2 is used for proposal updates
          .maybeSingle();

        if (existingSequence) {
          continue; // Already sent
        }

        // Create revival event
        await supabase.from("revival_events").insert({
          lead_id: lead.id,
          workspace_id: workspaceId,
          trigger_type: "proposal_expired",
          details: {
            proposal_sent_at: lead.proposal_sent_at,
            days_old: Math.floor(
              (new Date().getTime() - new Date(lead.proposal_sent_at).getTime()) /
                (1000 * 60 * 60 * 24)
            ),
          },
        });

        // Generate proposal update message
        const message = `Want an updated quote? Material prices have shifted since your last estimate. We can refresh it for you.`;

        // Send message (custom level 2 for proposal updates)
        const sendResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/revival/send-message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadId: lead.id,
              workspaceId,
              sequenceLevel: 2,
              channel: lead.phone ? "sms" : "email",
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
      } catch (err: any) {
        errors.push({ lead_id: lead.id, error: err.message });
      }
    }

    return NextResponse.json({
      message: "Proposal update prompts sent",
      processed,
      total: leadsWithOldProposals.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in proposal update prompt:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
































