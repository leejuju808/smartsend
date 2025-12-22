import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveOrg } from "@/lib/org";

// GET /api/agents - List all agents for the active org
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const { data: agents, error } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching agents:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, agents: agents || [] });
  } catch (error: any) {
    console.error("Error in GET /api/agents:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/agents - Create a new agent
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const body = await req.json();
    const { name, target_industry, target_role, daily_lead_limit, daily_message_limit } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { data: agent, error } = await supabase
      .from("ai_agents")
      .insert({
        org_id: org.id,
        name,
        target_industry: target_industry || null,
        target_role: target_role || null,
        daily_lead_limit: daily_lead_limit || 50,
        daily_message_limit: daily_message_limit || 100,
        status: "idle",
        autopilot_enabled: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating agent:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, agent });
  } catch (error: any) {
    console.error("Error in POST /api/agents:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

