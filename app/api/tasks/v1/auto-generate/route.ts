import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/tasks/v1/auto-generate
 * Manually trigger auto-generation of tasks
 * 
 * Body:
 * {
 *   source: 'inbox' | 'scheduler' | 'pipeline' | 'weather' | 'list_intelligence',
 *   contact_id?: string,
 *   metadata?: object
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
    const { source, contact_id, metadata = {} } = body;

    if (!source) {
      return NextResponse.json(
        { error: "Missing required field: source" },
        { status: 400 }
      );
    }

    // This endpoint is a placeholder for auto-generation logic
    // The actual auto-generation should happen via triggers and background workers
    // This endpoint can be used to manually trigger generation for testing/debugging

    return NextResponse.json({
      message: "Auto-generation triggered",
      source,
      note: "Tasks will be created by background workers and database triggers",
    });
  } catch (error) {
    console.error("Error in POST /api/tasks/v1/auto-generate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































