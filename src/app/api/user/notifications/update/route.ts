// POST /api/user/notifications/update
// Update user notification settings

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { roofing_company_id, module, notify_email, notify_sms, notify_inapp } = body;

    if (!roofing_company_id || !module) {
      return NextResponse.json(
        { error: "roofing_company_id and module are required" },
        { status: 400 }
      );
    }

    // Validate module
    const validModules = ['sales', 'production', 'safety', 'payments', 'crew', 'general'];
    if (!validModules.includes(module)) {
      return NextResponse.json(
        { error: "Invalid module. Must be one of: " + validModules.join(", ") },
        { status: 400 }
      );
    }

    // Check if user is a member
    const { data: member } = await supabase
      .from("roofing_company_members")
      .select("id")
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "You are not a member of this company" },
        { status: 403 }
      );
    }

    // Update or create notification settings
    const notificationData: any = {
      user_id: user.id,
      roofing_company_id,
      module,
      updated_at: new Date().toISOString(),
    };

    if (notify_email !== undefined) notificationData.notify_email = notify_email;
    if (notify_sms !== undefined) notificationData.notify_sms = notify_sms;
    if (notify_inapp !== undefined) notificationData.notify_inapp = notify_inapp;

    const { data: notification, error: notificationError } = await supabase
      .from("user_notifications_settings")
      .upsert(notificationData, {
        onConflict: "user_id,roofing_company_id,module",
      })
      .select()
      .single();

    if (notificationError) {
      console.error("Error updating notification settings:", notificationError);
      return NextResponse.json(
        { error: "Failed to update notification settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      notification,
    });
  } catch (error: any) {
    console.error("Error updating notification settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























