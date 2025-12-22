// Block 36555 — SmartSend Roofing "Smart Financing Engine + Instant Pre-Qual" v1
// API Route: Handle financing button clicks

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const {
      proposal_id,
      lead_id,
      amount,
    } = await req.json();

    if (!proposal_id && !lead_id) {
      return NextResponse.json(
        { error: "proposal_id or lead_id is required" },
        { status: 400 }
      );
    }

    // Get proposal info if we have proposal_id
    let finalProposalId = proposal_id;
    let finalLeadId = lead_id;
    let workspaceId: string | null = null;

    if (proposal_id) {
      const { data: proposal, error: proposalError } = await supabase
        .from("proposals")
        .select("id, lead_id, workspace_id, contact_id")
        .eq("id", proposal_id)
        .single();

      if (proposalError || !proposal) {
        return NextResponse.json(
          { error: "Proposal not found" },
          { status: 404 }
        );
      }

      finalProposalId = proposal.id;
      finalLeadId = proposal.lead_id || lead_id;
      workspaceId = proposal.workspace_id;
    } else if (lead_id) {
      // Get workspace from lead
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", lead_id)
        .single();

      if (!leadError && lead) {
        workspaceId = lead.workspace_id;
      }
    }

    // Upsert financing_status record
    const { data: existingStatus } = await supabase
      .from("financing_status")
      .select("id")
      .eq("proposal_id", finalProposalId)
      .maybeSingle();

    let financingStatusId: string;

    if (existingStatus) {
      // Update existing status
      const { data: updated, error: updateError } = await supabase
        .from("financing_status")
        .update({
          clicked: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingStatus.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      financingStatusId = updated.id;
    } else {
      // Create new status
      const { data: created, error: createError } = await supabase
        .from("financing_status")
        .insert({
          proposal_id: finalProposalId,
          lead_id: finalLeadId,
          clicked: true,
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      financingStatusId = created.id;
    }

    // The trigger will automatically create the 'clicked' event
    // But we can also manually create it if needed for metadata
    await supabase
      .from("financing_events")
      .insert({
        financing_id: financingStatusId,
        event_type: "clicked",
        metadata: {
          amount,
          clicked_at: new Date().toISOString(),
        },
      });

    // Send notification to contractor (if workspace_id available)
    if (workspaceId) {
      // Get lead info for notification
      if (finalLeadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("name, email, phone")
          .eq("id", finalLeadId)
          .single();

        if (lead) {
          // Create notification or send webhook
          // This can be enhanced to send real-time notifications
          console.log(`Financing clicked for lead: ${lead.name || lead.email}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      financing_status_id: financingStatusId,
    });
  } catch (error: any) {
    console.error("Error handling financing click:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
