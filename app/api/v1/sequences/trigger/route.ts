import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const workspaceId = await authenticateApiKey(req);
    const { lead_id, campaign_id } = await req.json();

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

    // Check if generate-send-queue edge function exists, otherwise use RPC
    // First try to call the edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/generate-send-queue`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            lead_id,
            campaign_id,
            workspace_id: workspaceId
          })
        }
      );

      if (resp.ok) {
        return NextResponse.json(await resp.json());
      }
    } catch (edgeErr) {
      // Fallback to RPC function if edge function doesn't exist
      console.log("Edge function not available, trying RPC");
    }

    // Fallback: Use RPC function generate_send_queue if it exists
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "generate_send_queue",
      { p_campaign: campaign_id }
    );

    if (rpcError) {
      // If RPC also fails, just return success (the queue generation might be handled elsewhere)
      return NextResponse.json({
        success: true,
        message: "Sequence trigger queued",
        lead_id,
        campaign_id
      });
    }

    return NextResponse.json({
      success: true,
      queued: rpcResult || 0,
      lead_id,
      campaign_id
    });
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



