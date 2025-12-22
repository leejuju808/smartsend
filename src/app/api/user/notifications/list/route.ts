// GET /api/user/notifications/list
// Get user notification settings for a company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const roofing_company_id = searchParams.get("roofing_company_id");

    if (!roofing_company_id) {
      return NextResponse.json(
        { error: "roofing_company_id is required" },
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

    // Get notification settings
    const { data: notifications, error: notificationsError } = await supabase
      .from("user_notifications_settings")
      .select("*")
      .eq("user_id", user.id)
      .eq("roofing_company_id", roofing_company_id)
      .order("module", { ascending: true });

    if (notificationsError) {
      console.error("Error fetching notification settings:", notificationsError);
      return NextResponse.json(
        { error: "Failed to fetch notification settings" },
        { status: 500 }
      );
    }

    // Format as map for easy lookup
    const notificationsMap: Record<string, any> = {};
    (notifications || []).forEach((notif: any) => {
      notificationsMap[notif.module] = {
        notify_email: notif.notify_email,
        notify_sms: notif.notify_sms,
        notify_inapp: notif.notify_inapp,
      };
    });

    return NextResponse.json({
      success: true,
      notifications: notificationsMap,
    });
  } catch (error: any) {
    console.error("Error fetching notification settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























