import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const runtime = "nodejs";

// GET - List integrations for the user's workspace
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's active workspace
    const { data: workspace } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (!workspace?.workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Get integrations for the workspace
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("org_id", workspace.workspace_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching integrations:", error);
      return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
    }

    return NextResponse.json(integrations || []);
  } catch (error) {
    console.error("GET integrations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create new integration
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, config } = body;

    if (!type || !config) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate integration type
    const validTypes = ["zapier", "slack", "hubspot"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid integration type" }, { status: 400 });
    }

    // Get user's active workspace
    const { data: workspace } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (!workspace?.workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Validate config based on type
    if (type === "zapier" && !config.url) {
      return NextResponse.json({ error: "Zapier integration requires webhook URL" }, { status: 400 });
    }

    if (type === "slack" && !config.webhook_url) {
      return NextResponse.json({ error: "Slack integration requires webhook URL" }, { status: 400 });
    }

    if (type === "hubspot" && !config.access_token) {
      return NextResponse.json({ error: "HubSpot integration requires access token" }, { status: 400 });
    }

    // Create integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .insert({
        org_id: workspace.workspace_id,
        type,
        config
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating integration:", error);
      return NextResponse.json({ error: "Failed to create integration" }, { status: 500 });
    }

    return NextResponse.json(integration);
  } catch (error) {
    console.error("POST integrations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Remove integration
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Integration ID required" }, { status: 400 });
    }

    // Get user's active workspace
    const { data: workspace } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (!workspace?.workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Delete integration (RLS will ensure user can only delete their own)
    const { error } = await supabase
      .from("integrations")
      .delete()
      .eq("id", id)
      .eq("org_id", workspace.workspace_id);

    if (error) {
      console.error("Error deleting integration:", error);
      return NextResponse.json({ error: "Failed to delete integration" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE integrations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 