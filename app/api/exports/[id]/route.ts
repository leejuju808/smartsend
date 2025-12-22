import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/exports/[id]
 * Check export status and get download URL
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { data: exportRecord, error } = await supabase
      .from("exports")
      .select("*")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (error || !exportRecord) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }

    // Check if expired
    const isExpired = exportRecord.expires_at && new Date(exportRecord.expires_at) < new Date();

    return NextResponse.json({
      ok: true,
      export: {
        ...exportRecord,
        is_expired: isExpired,
      },
    });
  } catch (error: any) {
    console.error("Get export error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































