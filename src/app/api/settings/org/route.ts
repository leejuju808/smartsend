import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

// Helper to get current org_id from cookie or user's first org
async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  // Fallback: get user's first org
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

// GET /api/settings/org - Get org settings
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get org settings
    const { data: settings, error } = await supabase
      .from("org_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If no settings exist, return defaults
    if (!settings) {
      return NextResponse.json({
        org_id: orgId,
        business_name: null,
        industry: "Roofing",
        logo_url: null,
        business_address: null,
        timezone: "America/Los_Angeles",
        default_lead_status: "new",
        default_task_offset_hours: 24,
        zero_notification_mode: false,
        notification_hot_lead: true,
        notification_reply: true,
        notification_task_due: true,
        notification_campaign_error: true,
        default_task_reminder_hours: 9,
        default_contact_view: "table",
        default_reply_inbox_sort: "newest",
        default_work_hours_start: "09:00:00",
        default_work_hours_end: "17:00:00",
      });
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("Error fetching org settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/settings/org - Update org settings
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Check if user is owner/admin/manager
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      business_name,
      industry,
      logo_url,
      business_address,
      timezone,
      default_lead_status,
      default_task_offset_hours,
      zero_notification_mode,
      notification_hot_lead,
      notification_reply,
      notification_task_due,
      notification_campaign_error,
      default_task_reminder_hours,
      default_contact_view,
      default_reply_inbox_sort,
      default_work_hours_start,
      default_work_hours_end,
    } = body;

    // Block 271700 — Zero-Notification Mode: when enabled, force-suppress everything except hot lead + estimate approved
    const zeroMode = Boolean(zero_notification_mode);

    // Upsert org settings
    const { data: settings, error } = await supabase
      .from("org_settings")
      .upsert(
        {
          org_id: orgId,
          business_name,
          industry,
          logo_url,
          business_address,
          timezone,
          default_lead_status,
          default_task_offset_hours,
          zero_notification_mode: zeroMode,
          notification_hot_lead: zeroMode ? true : notification_hot_lead,
          notification_reply: zeroMode ? false : notification_reply,
          notification_task_due: zeroMode ? false : notification_task_due,
          notification_campaign_error: zeroMode ? false : notification_campaign_error,
          default_task_reminder_hours,
          default_contact_view,
          default_reply_inbox_sort,
          default_work_hours_start,
          default_work_hours_end,
        },
        { onConflict: "org_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("Error updating org settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

