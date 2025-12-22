// Block 36555 — SmartSend Roofing "Smart Financing Engine + Instant Pre-Qual" v1
// API Route: Get financing status for a proposal

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const proposalId = params.proposalId;

    // Use the helper function
    const { data, error } = await supabase.rpc("get_proposal_financing_status", {
      p_proposal_id: proposalId,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error getting financing status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const proposalId = params.proposalId;
    
    const {
      event_type, // 'started', 'prequalified', 'approved', 'declined', 'abandoned'
      monthly_payment,
      apr,
      plan_length,
    } = await req.json();

    if (!event_type) {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 }
      );
    }

    // Get or create financing_status
    const { data: existingStatus } = await supabase
      .from("financing_status")
      .select("id")
      .eq("proposal_id", proposalId)
      .maybeSingle();

    let financingStatusId: string;
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Set the appropriate flag based on event_type
    switch (event_type) {
      case "started":
        updateData.started = true;
        break;
      case "prequalified":
        updateData.prequalified = true;
        if (monthly_payment) updateData.monthly_payment = monthly_payment;
        if (apr) updateData.apr = apr;
        if (plan_length) updateData.plan_length = plan_length;
        break;
      case "approved":
        updateData.approved = true;
        if (monthly_payment) updateData.monthly_payment = monthly_payment;
        if (apr) updateData.apr = apr;
        if (plan_length) updateData.plan_length = plan_length;
        break;
      case "declined":
        updateData.declined = true;
        break;
      case "abandoned":
        updateData.abandoned = true;
        break;
      default:
        return NextResponse.json(
          { error: "Invalid event_type" },
          { status: 400 }
        );
    }

    if (existingStatus) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from("financing_status")
        .update(updateData)
        .eq("id", existingStatus.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      financingStatusId = updated.id;
    } else {
      // Get proposal to get lead_id
      const { data: proposal } = await supabase
        .from("proposals")
        .select("lead_id, contact_id")
        .eq("id", proposalId)
        .single();

      // Create new
      const { data: created, error: createError } = await supabase
        .from("financing_status")
        .insert({
          proposal_id: proposalId,
          lead_id: proposal?.lead_id,
          clicked: true, // Assume they clicked to get here
          ...updateData,
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      financingStatusId = created.id;
    }

    // The trigger will create the event, but we can also manually add metadata
    await supabase
      .from("financing_events")
      .insert({
        financing_id: financingStatusId,
        event_type,
        metadata: {
          monthly_payment,
          apr,
          plan_length,
          updated_at: new Date().toISOString(),
        },
      });

    return NextResponse.json({
      ok: true,
      financing_status_id: financingStatusId,
    });
  } catch (error: any) {
    console.error("Error updating financing status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































