import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase";
import { getCurrentWorkspaceId } from "@/lib/workspace";

async function checkAccess(
  supabase: any,
  workspaceId: string,
  userId: string,
  requireWrite: boolean = false
): Promise<boolean> {
  const { data: membership } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (!membership) return false;
  if (requireWrite && !["owner", "admin"].includes(membership.role)) return false;
  return true;
}

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

    const hasAccess = await checkAccess(supabase, workspace_id, user.id, false);
    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("scheduler_rules")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json(
        { error: error.message || "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: {
        schedulerRules: data || {
          default_inspection_duration_minutes: 60,
          travel_time_multiplier: 1.50,
          buffer_between_appointments_minutes: 15,
          max_daily_appointments: 8,
          weather_block_enabled: true,
          homeowner_preform_enabled: true,
          sms_reminders_enabled: true,
          prep_checklist_enabled: true,
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching scheduler rules:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

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

    const hasAccess = await checkAccess(supabase, workspace_id, user.id, true);
    if (!hasAccess) {
      return NextResponse.json({ error: "Only Owners/Admins can edit settings" }, { status: 403 });
    }

    const body = await req.json();
    const { schedulerRules: updateData } = body;

    if (!updateData) {
      return NextResponse.json({ error: "schedulerRules data is required" }, { status: 400 });
    }

    const result = await supabase
      .from("scheduler_rules")
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
      console.error(`Error updating scheduler rules:`, result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error: any) {
    console.error("Error updating scheduler rules:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































