// Block 239000 — SmartSend Roofing Marketing Hub v1
// POST /api/marketing/process-step - Process next step in a campaign instance

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { instance_id } = body;

    if (!instance_id) {
      return NextResponse.json(
        { error: "Missing required field: instance_id" },
        { status: 400 }
      );
    }

    // Verify instance exists and user has access
    const { data: instance, error: instanceError } = await supabase
      .from("marketing_campaign_instances")
      .select(`
        *,
        marketing_campaigns!inner(
          *,
          workspaces!inner(id)
        )
      `)
      .eq("id", instance_id)
      .single();

    if (instanceError || !instance) {
      return NextResponse.json(
        { error: "Campaign instance not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", instance.marketing_campaigns.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Process the step using database function
    const { data: processed, error: processError } = await supabase.rpc(
      'process_marketing_campaign_step',
      {
        p_instance_id: instance_id,
      }
    );

    if (processError) {
      console.error("[Marketing Hub] Process step error:", processError);
      return NextResponse.json(
        { error: "Failed to process campaign step" },
        { status: 500 }
      );
    }

    // Get updated instance
    const { data: updatedInstance, error: fetchError } = await supabase
      .from("marketing_campaign_instances")
      .select(`
        *,
        marketing_campaigns(*)
      `)
      .eq("id", instance_id)
      .single();

    if (fetchError) {
      console.error("[Marketing Hub] Fetch instance error:", fetchError);
    }

    return NextResponse.json(
      { 
        processed: processed || false,
        instance: updatedInstance || instance,
        message: processed ? "Step processed successfully" : "Step not ready to process yet"
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Marketing Hub] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























