import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const workspaceId = await authenticateApiKey(req);
    const body = await req.json();

    const { lead_id, campaign_id } = body;

    if (!lead_id || !campaign_id) {
      return NextResponse.json(
        { error: "lead_id and campaign_id are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ensure campaign belongs to workspace
    const { data: camp } = await supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", campaign_id)
      .single();

    if (!camp) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (camp.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "campaign_not_in_workspace" },
        { status: 403 }
      );
    }

    // ensure lead belongs to workspace
    const { data: lead } = await supabase
      .from("leads")
      .select("workspace_id")
      .eq("id", lead_id)
      .single();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "lead_not_in_workspace" },
        { status: 403 }
      );
    }

    // attach
    const { data, error } = await supabase
      .from("campaign_leads")
      .insert({
        lead_id,
        campaign_id,
        workspace_id: workspaceId
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation (lead already in campaign)
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Lead already in campaign" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err: any) {
    if (err.message === "missing_api_key") {
      return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 });
    }
    if (err.message === "invalid_api_key") {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

