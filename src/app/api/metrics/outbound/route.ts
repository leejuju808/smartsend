import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;
    
    const supabase = getServerSupabase();
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "7d";
    const campaignId = searchParams.get("campaign_id");

    // Parse range (e.g., "7d", "30d")
    const sinceDays = range === "7d" ? 7 : range === "30d" ? 30 : parseInt(range.replace("d", "")) || 7;

    // Build query - use v_outbound_rollup if it exists, otherwise query send_logs + delivery_events
    let query = supabase
      .from("v_outbound_rollup")
      .select("*")
      .gte("day", new Date(Date.now() - (sinceDays - 1) * 86400000).toISOString().slice(0, 10))
      .order("day", { ascending: true });

    // Add campaign_id filter if provided
    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    const { data, error } = await query;

    if (error) {
      // Fallback: if view doesn't exist, query directly from tables
      console.warn("v_outbound_rollup not found, using fallback query:", error.message);
      
      // Build rollup from send_logs and delivery_events
      const startDate = new Date(Date.now() - (sinceDays - 1) * 86400000).toISOString().slice(0, 10);
      
      let sendLogsQuery = supabase
        .from("send_logs")
        .select("id, campaign_id, status, created_at")
        .gte("created_at", startDate)
        .eq("status", "sent");

      if (campaignId) {
        sendLogsQuery = sendLogsQuery.eq("campaign_id", campaignId);
      }

      const { data: logs } = await sendLogsQuery;

      // Group by day and campaign
      const rollup = new Map<string, any>();
      
      if (logs) {
        logs.forEach((log: any) => {
          const day = log.created_at.split("T")[0];
          const key = `${day}-${log.campaign_id || "null"}`;
          
          if (!rollup.has(key)) {
            rollup.set(key, {
              day,
              campaign_id: log.campaign_id,
              sent: 0,
              delivered: 0,
              opened: 0,
              clicked: 0,
              bounced: 0
            });
          }
          
          const entry = rollup.get(key)!;
          entry.sent += 1;
        });
      }

      // Get delivery events
      let eventsQuery = supabase
        .from("delivery_events")
        .select("campaign_id, kind, event, created_at")
        .gte("created_at", startDate);

      if (campaignId) {
        eventsQuery = eventsQuery.eq("campaign_id", campaignId);
      }

      const { data: events } = await eventsQuery;

      if (events) {
        events.forEach((event: any) => {
          const day = event.created_at.split("T")[0];
          const key = `${day}-${event.campaign_id || "null"}`;
          
          if (!rollup.has(key)) {
            rollup.set(key, {
              day,
              campaign_id: event.campaign_id,
              sent: 0,
              delivered: 0,
              opened: 0,
              clicked: 0,
              bounced: 0
            });
          }
          
          const entry = rollup.get(key)!;
          const kind = event.kind || event.event;
          
          if (kind === "delivered") entry.delivered += 1;
          else if (kind === "open" || kind === "opened") entry.opened += 1;
          else if (kind === "click" || kind === "clicked") entry.clicked += 1;
          else if (kind === "bounce") entry.bounced += 1;
        });
      }

      const rollupData = Array.from(rollup.values()).sort((a, b) => 
        a.day.localeCompare(b.day)
      );

      return NextResponse.json({ 
        data: rollupData,
        range,
        campaign_id: campaignId || null
      });
    }

    return NextResponse.json({ 
      data: data || [],
      range,
      campaign_id: campaignId || null
    });
  } catch (error) {
    console.error("Error in outbound metrics route:", error);
    return NextResponse.json(
      { error: "Failed to fetch outbound metrics", data: [] },
      { status: 500 }
    );
  }
}



