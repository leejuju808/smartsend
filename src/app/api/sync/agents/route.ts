import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * SmartSend AI Agents Sync API
 * 
 * Returns AI agent performance + leads data for AUREV HQ unified dashboard.
 * Secured with AUREV_SYNC_KEY header authentication.
 */
export async function GET(req: Request) {
  try {
    // Authenticate with shared sync key
    const authKey = req.headers.get("x-aurev-sync");
    if (authKey !== process.env.AUREV_SYNC_KEY) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 }
      );
    }

    // Use service role client for server-to-server sync
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Fetch AI agents with their performance metrics
    const { data: agents, error: agentsError } = await supabase
      .from("ai_agents")
      .select("id, name, leads_generated, leads_converted, messages_sent, replies_received, win_rate, status, created_at")
      .order("created_at", { ascending: false });

    if (agentsError) {
      console.error("Error fetching agents:", agentsError);
      return NextResponse.json(
        { error: "Failed to fetch agents", details: agentsError.message },
        { status: 500 }
      );
    }

    // Fetch leads data aggregated by status
    const { data: leadsStats, error: leadsError } = await supabase
      .from("ai_leads_queue")
      .select("status")
      .limit(10000); // Reasonable limit for aggregation

    if (leadsError) {
      console.error("Error fetching leads stats:", leadsError);
    }

    // Aggregate leads by status
    const leadsByStatus = leadsStats?.reduce((acc: Record<string, number>, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {}) || {};

    // Calculate total metrics
    const totalAgents = agents?.length || 0;
    const totalLeadsGenerated = agents?.reduce((sum, agent) => sum + (agent.leads_generated || 0), 0) || 0;
    const totalLeadsConverted = agents?.reduce((sum, agent) => sum + (agent.leads_converted || 0), 0) || 0;
    const totalMessagesSent = agents?.reduce((sum, agent) => sum + (agent.messages_sent || 0), 0) || 0;

    return NextResponse.json({
      agents: agents || [],
      metrics: {
        total_agents: totalAgents,
        total_leads_generated: totalLeadsGenerated,
        total_leads_converted: totalLeadsConverted,
        total_messages_sent: totalMessagesSent,
        conversion_rate: totalLeadsGenerated > 0 
          ? (totalLeadsConverted / totalLeadsGenerated * 100).toFixed(2)
          : "0.00",
        leads_by_status: leadsByStatus,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Sync API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

