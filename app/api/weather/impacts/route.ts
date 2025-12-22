/**
 * GET /api/weather/impacts
 * Block 15900 — Get storm impacts for contacts
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const contactId = searchParams.get("contact_id");
    const weatherEventId = searchParams.get("weather_event_id");
    const riskLevel = searchParams.get("risk_level");
    const minRiskScore = searchParams.get("min_risk_score");

    // Build query
    let query = supabase
      .from("contact_storm_impacts")
      .select(`
        *,
        contact:contacts(id, email, first_name, last_name, postal_code, zip),
        weather_event:weather_events(*)
      `)
      .eq("workspace_id", workspaceId)
      .order("detected_at", { ascending: false });

    if (contactId) {
      query = query.eq("contact_id", contactId);
    }
    if (weatherEventId) {
      query = query.eq("weather_event_id", weatherEventId);
    }
    if (riskLevel) {
      query = query.eq("storm_risk_level", riskLevel);
    }
    if (minRiskScore) {
      query = query.gte("storm_risk_score", parseInt(minRiskScore));
    }

    const { data: impacts, error } = await query;

    if (error) {
      console.error("Error fetching storm impacts:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      impacts: impacts || [],
      count: impacts?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/weather/impacts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































