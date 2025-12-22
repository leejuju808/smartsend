// app/api/hot-leads/route.ts
// Block 97000 — Hot Lead Fastlane API
// Returns hot leads with full details for the fastlane UI

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Get workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  const workspaceId = membership?.workspace_id;

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 10, 50) : 10;

  // Get hot leads with their latest heat event
  const { data: hotLeads, error } = await supabase
    .from("leads")
    .select(`
      id,
      email,
      first_name,
      last_name,
      phone,
      heat_score,
      updated_at,
      lead_heat_events!inner (
        id,
        intent,
        confidence,
        message_text,
        created_at
      )
    `)
    .eq("heat_score", "hot")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching hot leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch hot leads" },
      { status: 500 }
    );
  }

  // Transform the data to include the latest heat event
  const transformed = (hotLeads || []).map((lead: any) => {
    const latestEvent = Array.isArray(lead.lead_heat_events) 
      ? lead.lead_heat_events.sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
      : lead.lead_heat_events;

    return {
      lead_id: lead.id,
      email: lead.email,
      first_name: lead.first_name,
      last_name: lead.last_name,
      phone: lead.phone,
      heat_score: lead.heat_score,
      last_updated: lead.updated_at,
      latest_event: latestEvent ? {
        intent: latestEvent.intent,
        confidence: latestEvent.confidence,
        message_text: latestEvent.message_text,
        created_at: latestEvent.created_at,
      } : null,
    };
  });

  return NextResponse.json(transformed);
}


























