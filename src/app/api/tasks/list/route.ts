import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspace_id") || (await getCurrentWorkspaceId());
    const threadId = searchParams.get("thread_id");
    const assignedTo = searchParams.get("assigned_to");
    const status = searchParams.get("status");

    let query = supabase
      .from("tasks")
      .select(`
        *,
        leads:lead_id(id, email, first_name, last_name),
        threads:thread_id(id, last_message_at),
        assigned_user:assigned_to(id),
        creator:created_by(id)
      `)
      .order("created_at", { ascending: false });

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    if (threadId) {
      query = query.eq("thread_id", threadId);
    }

    if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("Error fetching tasks:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ tasks: tasks || [] });
  } catch (error) {
    console.error("Error in list tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
