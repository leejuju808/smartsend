// Block 18400 — Calendar Sync API
// POST /api/calendar/sync — Manually trigger calendar sync

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get workspace ID
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Check if user has calendar connection
    const { data: connections, error: connError } = await supabase
      .from("calendar_connections")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("provider", "google")
      .limit(1);

    if (connError || !connections || connections.length === 0) {
      return NextResponse.json(
        { error: "No active Google Calendar connection found" },
        { status: 404 }
      );
    }

    // Trigger sync via edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Call the calendar sync edge function
    const syncResponse = await fetch(
      `${supabaseUrl}/functions/v1/calendar-sync-google`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    if (!syncResponse.ok) {
      const error = await syncResponse.text();
      return NextResponse.json(
        { error: "Sync failed", details: error },
        { status: 500 }
      );
    }

    const syncResult = await syncResponse.json();

    return NextResponse.json({
      success: true,
      message: "Calendar sync triggered",
      result: syncResult,
    });
  } catch (error: any) {
    console.error("[Calendar Sync] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































