import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/templates/[id]/variants/stats
 * Get variant statistics for a template
 * Returns aggregated stats from template_variant_stats materialized view
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

    // Verify template ownership/access
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("id, owner_id, workspace_id")
      .eq("id", params.id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Check access
    if (template.owner_id !== user.id) {
      if (template.workspace_id) {
        const { data: member } = await supabase
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", template.workspace_id)
          .eq("user_id", user.id)
          .single();

        if (!member) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Get variant stats from materialized view
    const { data: stats, error: statsError } = await supabase
      .from("template_variant_stats")
      .select("*")
      .eq("template_id", params.id)
      .order("sent", { ascending: false });

    if (statsError) {
      console.error("Error fetching variant stats:", statsError);
      return NextResponse.json(
        { error: "Failed to fetch variant stats", details: statsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ stats: stats || [] });
  } catch (error: any) {
    console.error("Error in get variant stats:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








