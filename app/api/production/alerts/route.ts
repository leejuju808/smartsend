import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unread_only") === "true";

    let query = supabase
      .from("production_alerts")
      .select(
        `
        *,
        job:roofing_jobs(
          id,
          title,
          homeowner_name,
          address
        ),
        crew:crews(
          id,
          name
        )
      `
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching production alerts:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/production/alerts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { alert_id, is_read } = await req.json();

    if (!alert_id || typeof is_read !== "boolean") {
      return NextResponse.json(
        { error: "alert_id and is_read required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("production_alerts")
      .update({ is_read })
      .eq("id", alert_id)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("Error updating alert:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in PATCH /api/production/alerts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































