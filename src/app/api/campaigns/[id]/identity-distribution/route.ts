/**
 * Block 12100 — Campaign Identity Distribution Endpoint
 * Returns distribution of sends across identities for a campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaignId = params.id;

  try {
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get identity distribution
    const { data: distribution, error } = await supabase.rpc(
      "get_campaign_identity_distribution",
      {
        p_campaign_id: campaignId,
      }
    );

    if (error) {
      console.error("Error getting identity distribution:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      distribution: distribution || [],
      total_identities: distribution?.length || 0,
    });
  } catch (error: any) {
    console.error("Identity distribution error:", error);
    return NextResponse.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}




























































