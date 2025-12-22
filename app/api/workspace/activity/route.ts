import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireWorkspace } from "@/src/lib/workspace/withWorkspace";

/**
 * GET /api/workspace/activity
 * Get workspace activity log
 */
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name) => cookieStore.get(name)?.value } }
    );

    const workspaceCheck = await requireWorkspace(req);
    if ("error" in workspaceCheck) {
      return workspaceCheck.error;
    }

    const { workspace_id } = workspaceCheck;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const entityType = searchParams.get("entity_type");
    const action = searchParams.get("action");

    let query = supabase
      .from("workspace_activity_log")
      .select(`
        id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at,
        user_id,
        profiles:user_id (
          email,
          full_name
        )
      `)
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    if (action) {
      query = query.eq("action", action);
    }

    const { data: activities, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ activities: activities || [] });
  } catch (e: any) {
    console.error("Error fetching activity log:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
