/**
 * GET /api/notifications/preferences
 * Get notification preferences for current user
 * 
 * PUT /api/notifications/preferences
 * Update notification preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Get notification preferences
    const { data: preferences, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return defaults if no preferences exist
    if (!preferences) {
      return NextResponse.json({
        data: {
          enable_push: true,
          enable_email: true,
          enable_sms: false,
          enable_in_app: true,
          enable_critical: true,
          enable_important: true,
          enable_standard: true,
          category_preferences: {},
          quiet_hours_start: null,
          quiet_hours_end: null,
          enable_daily_summary: true,
          daily_summary_time: "06:00:00",
        },
      });
    }

    return NextResponse.json({ data: preferences });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const body = await req.json();

    // Upsert notification preferences
    const { data: preferences, error } = await supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: user.id,
          org_id: orgId,
          enable_push: body.enable_push ?? true,
          enable_email: body.enable_email ?? true,
          enable_sms: body.enable_sms ?? false,
          enable_in_app: body.enable_in_app ?? true,
          enable_critical: body.enable_critical ?? true,
          enable_important: body.enable_important ?? true,
          enable_standard: body.enable_standard ?? true,
          category_preferences: body.category_preferences ?? {},
          quiet_hours_start: body.quiet_hours_start ?? null,
          quiet_hours_end: body.quiet_hours_end ?? null,
          enable_daily_summary: body.enable_daily_summary ?? true,
          daily_summary_time: body.daily_summary_time ?? "06:00:00",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,org_id",
        }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: preferences });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































