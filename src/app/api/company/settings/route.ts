import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

// Helper to check if user has access (read: any member, write: owner/admin)
async function checkAccess(
  supabase: any,
  workspaceId: string,
  userId: string,
  requireWrite: boolean = false
): Promise<boolean> {
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!workspaceMember) return false;

  if (requireWrite) {
    return workspaceMember.role === "owner" || workspaceMember.role === "admin";
  }

  return true; // Any member can read
}

// GET /api/company/settings - Get all company settings
export async function GET(req: NextRequest) {
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

    // Check read access
    const hasAccess = await checkAccess(supabase, workspace_id, user.id, false);
    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch all company settings
    const [settingsResult, brandingResult, notificationsResult, schedulerResult, pipelineResult, assignmentResult, revenueResult] = await Promise.all([
      supabase.from("company_settings").select("*").eq("workspace_id", workspace_id).maybeSingle(),
      supabase.from("company_branding").select("*").eq("workspace_id", workspace_id).maybeSingle(),
      supabase.from("company_notifications").select("*").eq("workspace_id", workspace_id).maybeSingle(),
      supabase.from("company_scheduler_settings").select("*").eq("workspace_id", workspace_id).maybeSingle(),
      supabase.from("company_pipeline_settings").select("*").eq("workspace_id", workspace_id).maybeSingle(),
      supabase.from("company_lead_assignment_rules").select("*").eq("workspace_id", workspace_id).maybeSingle(),
      supabase.from("company_revenue_settings").select("*").eq("workspace_id", workspace_id).maybeSingle(),
    ]);

    return NextResponse.json({
      settings: settingsResult.data || null,
      branding: brandingResult.data || null,
      notifications: notificationsResult.data || null,
      scheduler: schedulerResult.data || null,
      pipeline: pipelineResult.data || null,
      assignment: assignmentResult.data || null,
      revenue: revenueResult.data || null,
    });
  } catch (error: any) {
    console.error("Error fetching company settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/company/settings - Update company settings
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
    const hasAccess = await checkAccess(supabase, workspace_id, user.id, true);
    if (!hasAccess) {
      return NextResponse.json({ error: "Only Owners/Admins can edit settings" }, { status: 403 });
    }

    const body = await req.json();
    const { section, data: updateData } = body;

    if (!section || !updateData) {
      return NextResponse.json({ error: "section and data are required" }, { status: 400 });
    }

    let result;
    const tableMap: Record<string, string> = {
      info: "company_settings",
      branding: "company_branding",
      notifications: "company_notifications",
      scheduler: "company_scheduler_settings",
      pipeline: "company_pipeline_settings",
      assignment: "company_lead_assignment_rules",
      revenue: "company_revenue_settings",
    };

    const tableName = tableMap[section];
    if (!tableName) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }

    // Upsert the settings
    result = await supabase
      .from(tableName)
      .upsert(
        {
          workspace_id,
          ...updateData,
        },
        {
          onConflict: "workspace_id",
        }
      )
      .select()
      .single();

    if (result.error) {
      console.error(`Error updating ${section}:`, result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error: any) {
    console.error("Error updating company settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































