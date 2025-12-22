import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAutopilotSnapshot } from "@/lib/autopilot/guard";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    
    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign ID required" },
        { status: 400 }
      );
    }

    // Check if campaign exists and is paused
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, paused, pause_reason, workspace_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (!campaign.paused) {
      return NextResponse.json(
        { message: "Campaign is not paused", campaign_id: campaignId },
        { status: 200 }
      );
    }

    // BLOCK 273000 — AUTOPILOT: if enabled for workspace, block resume (no overrides).
    const wsId = String((campaign as any)?.workspace_id || "");
    if (wsId) {
      const snap = await getAutopilotSnapshot(wsId);
      if (snap.enabled) {
        return NextResponse.json(
          { error: "AUTOPILOT is ON. Resume campaign is locked.", autopilot: snap },
          { status: 423 }
        );
      }
    }

    // Resume campaign using Block 11800 function
    const { data: result, error: resumeError } = await supabase.rpc(
      "resume_campaign",
      { p_campaign_id: campaignId }
    );

    if (resumeError) {
      console.error("Resume campaign error:", resumeError);
      return NextResponse.json(
        { error: resumeError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      campaign_id: campaignId,
      message: "Campaign resumed successfully",
      result,
    });
  } catch (error: any) {
    console.error("Resume campaign error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
