import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/tasks/v1/bulk
 * Bulk operations on tasks
 * 
 * Body:
 * {
 *   action: 'complete' | 'delete' | 'update_status' | 'assign',
 *   task_ids: string[],
 *   updates?: { status?, urgency?, user_id?, etc. }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json();
    const { action, task_ids, updates = {} } = body;

    if (!action || !task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: action, task_ids" },
        { status: 400 }
      );
    }

    let result;
    const updateData: any = {};

    switch (action) {
      case "complete":
        updateData.status = "completed";
        updateData.completed_at = new Date().toISOString();
        break;

      case "update_status":
        if (!updates.status) {
          return NextResponse.json(
            { error: "Missing status in updates" },
            { status: 400 }
          );
        }
        updateData.status = updates.status;
        if (updates.status === "completed" && !updates.completed_at) {
          updateData.completed_at = new Date().toISOString();
        }
        break;

      case "assign":
        if (!updates.user_id) {
          return NextResponse.json(
            { error: "Missing user_id in updates" },
            { status: 400 }
          );
        }
        updateData.user_id = updates.user_id;
        break;

      case "delete":
        const { error: deleteError } = await supabase
          .from("smartsend_tasks")
          .delete()
          .in("id", task_ids)
          .eq("workspace_id", workspaceId);

        if (deleteError) {
          console.error("Error deleting tasks:", deleteError);
          return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          deleted_count: task_ids.length,
        });

      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}` },
          { status: 400 }
        );
    }

    // Apply updates
    if (Object.keys(updateData).length > 0) {
      // Merge any additional updates
      Object.assign(updateData, updates);
      delete updateData.status; // Already set above if needed
      delete updateData.completed_at; // Already set above if needed
      delete updateData.user_id; // Already set above if needed

      const { data, error } = await supabase
        .from("smartsend_tasks")
        .update(updateData)
        .in("id", task_ids)
        .eq("workspace_id", workspaceId)
        .select();

      if (error) {
        console.error("Error updating tasks:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      result = {
        success: true,
        updated_count: data?.length || 0,
        tasks: data,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in POST /api/tasks/v1/bulk:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































