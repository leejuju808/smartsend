// Block 27340 — Collections Priority API
// Returns prioritized list of overdue payments

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace(s)
    const { data: workspaceMembers } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!workspaceMembers || workspaceMembers.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const workspaceIds = workspaceMembers.map((wm) => wm.workspace_id);

    // Get jobs for user's workspaces first
    const { data: jobs } = await supabase
      .from("roofing_jobs")
      .select("id")
      .in("workspace_id", workspaceIds);

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const jobIds = jobs.map((j) => j.id);

    // Now get priority items for these jobs
    const { data: priorityData, error: priorityError } = await supabase
      .from("roofing_collections_priority")
      .select("*")
      .in("job_id", jobIds)
      .order("days_overdue", { ascending: false })
      .order("amount", { ascending: false });

    if (priorityError) {
      console.error("Error fetching collections priority:", priorityError);
      return NextResponse.json(
        { error: priorityError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: priorityData || [] });
  } catch (error: any) {
    console.error("Error in collections priority API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































