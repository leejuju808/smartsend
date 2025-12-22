/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Approve Storm Campaign Trigger
 * 
 * POST /api/marketing/storm-triggers/[id]/approve - Approve and launch storm campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get trigger
    const { data: trigger, error: triggerError } = await supabase
      .from("storm_campaign_triggers")
      .select("*")
      .eq("id", id)
      .single();

    if (triggerError || !trigger) {
      return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", trigger.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Update approval status
    const { data: updatedTrigger, error: updateError } = await supabase
      .from("storm_campaign_triggers")
      .update({
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error approving trigger:", updateError);
      return NextResponse.json({ error: "Failed to approve trigger" }, { status: 500 });
    }

    // If campaign exists, launch it
    if (trigger.campaign_id) {
      // Launch the campaign
      const launchResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/marketing/campaigns/${trigger.campaign_id}/launch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.get("cookie") || "",
          },
          body: JSON.stringify({ approve: true }),
        }
      );

      if (!launchResponse.ok) {
        console.error("Error launching campaign:", await launchResponse.text());
      }
    }

    return NextResponse.json({ trigger: updatedTrigger });
  } catch (error: any) {
    console.error("Error in POST /api/marketing/storm-triggers/[id]/approve:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































