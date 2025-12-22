import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;

    // Get all step stats for this campaign
    const { data, error } = await supabase.rpc("get_campaign_step_stats", {
      p_campaign_id: campaignId,
    });

    if (error) {
      console.error("Error fetching campaign step stats:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ steps: data || [] });
  } catch (error: any) {
    console.error("Failed to fetch campaign step stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch stats" },
      { status: 500 }
    );
  }
}

