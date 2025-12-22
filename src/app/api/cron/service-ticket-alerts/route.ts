// GET /api/cron/service-ticket-alerts
// Cron job to alert office if service ticket not touched for 24 hours
// Should be run hourly

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret if needed
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find tickets that haven't been updated in 24 hours and are still open
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: staleTickets, error } = await supabase
      .from("service_tickets")
      .select(`
        *,
        workspace:workspaces(*)
      `)
      .in("status", ["open", "scheduled"])
      .lt("updated_at", twentyFourHoursAgo.toISOString());

    if (error) {
      console.error("Error fetching stale tickets:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const alerts = [];

    for (const ticket of staleTickets || []) {
      // TODO: Send notification to office/workspace
      // This would integrate with your notification system
      
      alerts.push({
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        workspace_id: ticket.workspace_id,
        last_updated: ticket.updated_at,
        hours_since_update: Math.floor(
          (new Date().getTime() - new Date(ticket.updated_at).getTime()) / (1000 * 60 * 60)
        ),
      });
    }

    return NextResponse.json({
      message: `Found ${alerts.length} stale service tickets`,
      alerts,
    });
  } catch (error: any) {
    console.error("Error in service-ticket-alerts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























