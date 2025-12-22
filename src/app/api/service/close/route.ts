// POST /api/service/close
// Close service ticket with service log

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      ticket_id,
      crew_id,
      notes,
      resolution,
      work_performed,
      materials_used,
      upsell_opportunity = false,
      upsell_description,
      upsell_estimated_value,
      actual_cost,
    } = body;

    // Validate required fields
    if (!ticket_id || !resolution) {
      return NextResponse.json(
        { error: "ticket_id and resolution are required" },
        { status: 400 }
      );
    }

    // Verify ticket exists and belongs to workspace
    const { data: ticket, error: ticketError } = await supabase
      .from("service_tickets")
      .select("id, workspace_id, status")
      .eq("id", ticket_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json(
        { error: "Service ticket not found" },
        { status: 404 }
      );
    }

    // Create service log
    const { data: serviceLog, error: logError } = await supabase
      .from("service_logs")
      .insert({
        ticket_id,
        crew_id: crew_id || null,
        user_id: user.id,
        notes: notes || null,
        resolution,
        work_performed: work_performed || null,
        materials_used: materials_used || null,
        completed: true,
        completed_at: new Date().toISOString(),
        upsell_opportunity,
        upsell_description: upsell_description || null,
        upsell_estimated_value: upsell_estimated_value || null,
      })
      .select()
      .single();

    if (logError) {
      console.error("Error creating service log:", logError);
      return NextResponse.json(
        { error: logError.message },
        { status: 500 }
      );
    }

    // Update ticket status
    const updateData: any = {
      status: "completed",
      completed_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    };

    if (actual_cost !== undefined) {
      updateData.actual_cost = actual_cost;
    }

    await supabase
      .from("service_tickets")
      .update(updateData)
      .eq("id", ticket_id);

    // If upsell opportunity, create change order draft
    if (upsell_opportunity && upsell_description && upsell_estimated_value) {
      // TODO: Auto-create change order draft
      // This would integrate with the change order system
      console.log("Upsell opportunity detected - change order should be created");
    }

    // TODO: Update customer portal
    // TODO: Send notification to customer
    // TODO: Trigger upsell AI if applicable

    return NextResponse.json(
      { 
        service_log: serviceLog,
        ticket: {
          ...ticket,
          status: "completed",
        },
        message: "Service ticket closed successfully"
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in service/close:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























