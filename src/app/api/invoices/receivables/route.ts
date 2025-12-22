import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";
import { getActiveWorkspaceId } from "@/src/lib/workspace/context";

// GET /api/invoices/receivables - Get receivables dashboard data
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const teamId = await getCurrentTeamId();
    const workspaceId = await getActiveWorkspaceId();

    // Get receivables using the database function
    const { data: receivables, error } = await supabase.rpc("get_outstanding_receivables", {
      p_team_id: teamId || null,
      p_workspace_id: workspaceId || null,
    });

    if (error) {
      console.error("Error fetching receivables:", error);
      return NextResponse.json(
        { error: "Failed to fetch receivables", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ receivables: receivables || {} });
  } catch (error: any) {
    console.error("Error in receivables route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

































