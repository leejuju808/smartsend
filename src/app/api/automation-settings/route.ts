import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

// Helper to check if user has admin access
async function checkAdminAccess(
  supabase: any,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!workspaceMember) return false;
  return workspaceMember.role === "owner" || workspaceMember.role === "admin";
}

// GET /api/automation-settings - Get automation settings for current workspace
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

    // Check read access (any member can read)
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get or create settings
    const { data: settings, error } = await supabase
      .rpc("get_automation_settings", { p_workspace_id: workspace_id });

    if (error) {
      // Fallback: try direct query
      const { data: directSettings, error: directError } = await supabase
        .from("automation_settings")
        .select("*")
        .eq("workspace_id", workspace_id)
        .maybeSingle();

      if (directError) {
        console.error("Error fetching automation settings:", directError);
        return NextResponse.json({ error: directError.message }, { status: 500 });
      }

      // If no settings exist, return defaults
      if (!directSettings) {
        return NextResponse.json({
          // Return default values
          hot_lead_threshold: 80,
          warm_lead_threshold: 50,
          high_probability_threshold: 70,
          high_value_threshold: 10000,
          auto_followup_delay_hours: 24,
          max_auto_followups: 3,
          resurrect_never_replied: true,
          resurrect_ghosted: true,
          resurrect_past_customers: false,
          resurrection_cooldown_days: 30,
          auto_assign_new_leads: true,
          routing_mode: "balanced",
          max_active_leads_per_estimator: 20,
          missed_followups_before_handoff: 2,
          risk_engine_enabled: true,
          alert_on_high_risk: true,
          alert_on_critical_risk: true,
          alert_via_email: true,
          alert_via_sms: false,
          alert_via_inapp: true,
          max_tasks_per_estimator_daily: 15,
          include_follow_up_hot: true,
          include_follow_up_warm: true,
          include_send_proposal: true,
          include_save_critical_job: true,
          include_resurrection: true,
          include_reply_angry: true,
          owner_only_high_value_threshold: 15000,
          max_messages_per_day: 500,
          max_messages_per_lead_per_day: 2,
          quiet_hours_start: "21:00",
          quiet_hours_end: "08:00",
        });
      }

      return NextResponse.json(directSettings);
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("Error fetching automation settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/automation-settings - Update automation settings
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

    // Check admin access
    const isAdmin = await checkAdminAccess(supabase, workspace_id, user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only Owners/Admins can edit automation settings" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Validate and prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Helper to add field if provided
    const addField = (key: string, value: any) => {
      if (value !== undefined) {
        updateData[key] = value;
      }
    };

    // Lead scoring
    addField("hot_lead_threshold", body.hot_lead_threshold);
    addField("warm_lead_threshold", body.warm_lead_threshold);
    addField("high_probability_threshold", body.high_probability_threshold);
    addField("high_value_threshold", body.high_value_threshold);

    // Follow-up & resurrection
    addField("auto_followup_delay_hours", body.auto_followup_delay_hours);
    addField("max_auto_followups", body.max_auto_followups);
    addField("resurrect_never_replied", body.resurrect_never_replied);
    addField("resurrect_ghosted", body.resurrect_ghosted);
    addField("resurrect_past_customers", body.resurrect_past_customers);
    addField("resurrection_cooldown_days", body.resurrection_cooldown_days);

    // Routing & handoff
    addField("auto_assign_new_leads", body.auto_assign_new_leads);
    addField("routing_mode", body.routing_mode);
    addField("max_active_leads_per_estimator", body.max_active_leads_per_estimator);
    addField("missed_followups_before_handoff", body.missed_followups_before_handoff);

    // Risk & alerts
    addField("risk_engine_enabled", body.risk_engine_enabled);
    addField("alert_on_high_risk", body.alert_on_high_risk);
    addField("alert_on_critical_risk", body.alert_on_critical_risk);
    addField("alert_via_email", body.alert_via_email);
    addField("alert_via_sms", body.alert_via_sms);
    addField("alert_via_inapp", body.alert_via_inapp);

    // Action queue
    addField("max_tasks_per_estimator_daily", body.max_tasks_per_estimator_daily);
    addField("include_follow_up_hot", body.include_follow_up_hot);
    addField("include_follow_up_warm", body.include_follow_up_warm);
    addField("include_send_proposal", body.include_send_proposal);
    addField("include_save_critical_job", body.include_save_critical_job);
    addField("include_resurrection", body.include_resurrection);
    addField("include_reply_angry", body.include_reply_angry);
    addField("owner_only_high_value_threshold", body.owner_only_high_value_threshold);

    // Safety limits
    addField("max_messages_per_day", body.max_messages_per_day);
    addField("max_messages_per_lead_per_day", body.max_messages_per_lead_per_day);
    addField("quiet_hours_start", body.quiet_hours_start);
    addField("quiet_hours_end", body.quiet_hours_end);

    if (Object.keys(updateData).length === 1) {
      // Only updated_at was set, nothing to update
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Upsert settings (insert if doesn't exist, update if it does)
    const { data, error } = await supabase
      .from("automation_settings")
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

    if (error) {
      console.error("Error updating automation settings:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error updating automation settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}









































