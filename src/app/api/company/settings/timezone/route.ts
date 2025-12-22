import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

// Helper to check if user has write access (owner/admin)
async function checkWriteAccess(
  supabase: any,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return workspaceMember && (workspaceMember.role === "owner" || workspaceMember.role === "admin");
}

// POST /api/company/settings/timezone - Update timezone
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace_id = await getCurrentWorkspaceId();
    if (!workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Check write access
    const hasAccess = await checkWriteAccess(supabase, workspace_id, user.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Only Owners/Admins can edit timezone" }, { status: 403 });
    }

    const body = await req.json();
    const { timezone } = body;

    if (!timezone) {
      return NextResponse.json({ error: "timezone is required" }, { status: 400 });
    }

    // Validate timezone (basic check - could be enhanced)
    const validTimezones = [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      // Add more as needed
    ];

    if (!validTimezones.includes(timezone) && !timezone.includes("/")) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("company_settings")
      .upsert(
        {
          workspace_id,
          timezone,
        },
        {
          onConflict: "workspace_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating timezone:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error updating timezone:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































