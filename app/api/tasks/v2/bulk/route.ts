// Block 16200 — SmartSend Tasks & Follow-Up Board v1
// Bulk operations for tasks

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/tasks/v2/bulk/complete
 * Bulk complete multiple tasks
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { taskIds, action } = body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: "taskIds must be a non-empty array" }, { status: 400 });
    }

    if (!action || !['complete', 'delete'].includes(action)) {
      return NextResponse.json({ error: "action must be 'complete' or 'delete'" }, { status: 400 });
    }

    // Get workspace_id and org_id
    const workspaceId = await getCurrentWorkspaceId();
    const orgId = await getCurrentOrgId();

    if (!workspaceId && !orgId) {
      return NextResponse.json({ error: "No workspace or organization found" }, { status: 400 });
    }

    // Build query
    let query = supabase.from("tasks");

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    } else if (orgId) {
      query = query.eq("org_id", orgId);
    }

    query = query.in("id", taskIds);

    // Verify all tasks belong to user's workspace/org
    const { data: tasks, error: fetchError } = await query.select("id, assigned_to");

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!tasks || tasks.length !== taskIds.length) {
      return NextResponse.json({ error: "Some tasks not found or unauthorized" }, { status: 403 });
    }

    // Perform action
    if (action === 'complete') {
      const { data, error } = await supabase
        .from("tasks")
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
          status: 'completed',
        })
        .in("id", taskIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        completed: taskIds.length 
      });
    } else if (action === 'delete') {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .in("id", taskIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        deleted: taskIds.length 
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































