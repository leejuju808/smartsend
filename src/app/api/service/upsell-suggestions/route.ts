// GET /api/service/upsell-suggestions
// Get AI-powered upsell suggestions based on service logs

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
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

    const { searchParams } = req.nextUrl;
    const ticket_id = searchParams.get("ticket_id");

    // Get service logs with upsell opportunities
    let query = supabase
      .from("service_logs")
      .select(`
        *,
        ticket:service_tickets(
          *,
          homeowner:homeowners(*),
          job:roofing_jobs(*)
        )
      `)
      .eq("upsell_opportunity", true)
      .eq("ticket.workspace_id", workspaceId);

    if (ticket_id) {
      query = query.eq("ticket_id", ticket_id);
    }

    const { data: upsellLogs, error } = await query;

    if (error) {
      console.error("Error fetching upsell suggestions:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Format suggestions
    const suggestions = (upsellLogs || []).map((log) => ({
      id: log.id,
      ticket_id: log.ticket_id,
      ticket_number: log.ticket?.ticket_number,
      customer_name: log.ticket?.customer_name || log.ticket?.homeowner?.name,
      description: log.upsell_description,
      estimated_value: log.upsell_estimated_value,
      discovered_date: log.created_at,
      property_address: log.ticket?.property_address || log.ticket?.job?.address,
    }));

    return NextResponse.json({
      suggestions,
      count: suggestions.length,
    });
  } catch (error: any) {
    console.error("Error in service/upsell-suggestions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























