/**
 * GET /api/weather/triggers
 * Block 15900 — Get storm campaign triggers
 * POST /api/weather/triggers
 * Block 15900 — Update storm campaign trigger status
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
    const status = searchParams.get("status");

    // Build query
    let query = supabase
      .from("storm_campaign_triggers")
      .select(`
        *,
        weather_event:weather_events(*),
        campaign:campaigns(id, name, status)
      `)
      .eq("workspace_id", workspaceId)
      .order("suggested_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: triggers, error } = await query;

    if (error) {
      console.error("Error fetching storm triggers:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      triggers: triggers || [],
      count: triggers?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/weather/triggers:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { trigger_id, status, campaign_id } = body;

    if (!trigger_id || !status) {
      return NextResponse.json(
        { error: "trigger_id and status are required" },
        { status: 400 }
      );
    }

    const updateData: any = {
      status,
      reviewed_at: new Date().toISOString(),
    };

    if (status === "started") {
      updateData.started_at = new Date().toISOString();
      if (campaign_id) {
        updateData.campaign_id = campaign_id;
      }
    } else if (status === "dismissed") {
      updateData.dismissed_at = new Date().toISOString();
    }

    const { data: trigger, error } = await supabase
      .from("storm_campaign_triggers")
      .update(updateData)
      .eq("id", trigger_id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error) {
      console.error("Error updating storm trigger:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      trigger,
    });
  } catch (error: any) {
    console.error("Error in POST /api/weather/triggers:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































