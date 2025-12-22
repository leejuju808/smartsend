import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/inbox/calendar/reps
 * Fetch available reps for calendar assignment
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    // Get all workspace members
    const { data: members, error } = await supabase
      .from("workspace_members")
      .select(`
        user_id,
        profiles (
          id,
          full_name,
          email
        )
      `)
      .eq("workspace_id", workspaceMember.workspace_id)
      .in("role", ["owner", "admin", "member"]);

    if (error) {
      console.error("Error fetching reps:", error);
      return NextResponse.json(
        { error: "Failed to fetch reps", details: error.message },
        { status: 500 }
      );
    }

    // Transform members to reps format
    const reps = (members || [])
      .filter((m: any) => m.profiles)
      .map((m: any) => ({
        id: m.user_id,
        name: m.profiles?.full_name || null,
        email: m.profiles?.email || "",
      }));

    return NextResponse.json({ reps });
  } catch (error: any) {
    console.error("Error in calendar reps route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



















































