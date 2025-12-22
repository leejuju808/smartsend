import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const duration = searchParams.get("duration") || "30";

    if (!date) {
      return NextResponse.json(
        { error: "date parameter is required" },
        { status: 400 }
      );
    }

    // Get user's workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get available times using the database function
    const { data: times, error: timesError } = await supabase.rpc(
      "get_available_times",
      {
        p_workspace_id: member.workspace_id,
        p_date: date,
        p_duration_minutes: parseInt(duration),
      }
    );

    if (timesError) {
      console.error("Error getting available times:", timesError);
      // Return empty array if function doesn't exist or fails
      return NextResponse.json({ times: [] });
    }

    return NextResponse.json({ times: times || [] });
  } catch (error: any) {
    console.error("Error in available-times route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



















































