import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveOrg } from "@/lib/org";

// GET /api/agents/[id] - Get a specific agent
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { data: agent, error } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("id", params.id)
      .eq("org_id", org.id)
      .single();

    if (error) {
      console.error("Error fetching agent:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, agent });
  } catch (error: any) {
    console.error("Error in GET /api/agents/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/agents/[id] - Update an agent
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const updateData: any = {};

    // Only update fields that are provided
    if (body.name !== undefined) updateData.name = body.name;
    if (body.target_industry !== undefined) updateData.target_industry = body.target_industry;
    if (body.target_role !== undefined) updateData.target_role = body.target_role;
    if (body.daily_lead_limit !== undefined) updateData.daily_lead_limit = body.daily_lead_limit;
    if (body.daily_message_limit !== undefined) updateData.daily_message_limit = body.daily_message_limit;
    if (body.autopilot_enabled !== undefined) updateData.autopilot_enabled = body.autopilot_enabled;
    if (body.status !== undefined) updateData.status = body.status;

    const { data: agent, error } = await supabase
      .from("ai_agents")
      .update(updateData)
      .eq("id", params.id)
      .eq("org_id", org.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating agent:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, agent });
  } catch (error: any) {
    console.error("Error in PUT /api/agents/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/agents/[id] - Delete an agent
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { error } = await supabase
      .from("ai_agents")
      .delete()
      .eq("id", params.id)
      .eq("org_id", org.id);

    if (error) {
      console.error("Error deleting agent:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/agents/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

