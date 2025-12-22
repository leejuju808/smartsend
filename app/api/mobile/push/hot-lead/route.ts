import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/mobile/push/hot-lead
 * Send push notification for HOT lead (called by system when HOT lead detected)
 */
export async function POST(req: NextRequest) {
  try {
    const { workspace_id, lead_id, message } = await req.json();

    if (!workspace_id || !lead_id) {
      return NextResponse.json(
        { error: "workspace_id and lead_id required" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get all users in workspace with push targets
    const { data: pushTargets, error: targetsError } = await supabase
      .from("user_push_targets")
      .select("user_id, provider, target_id")
      .eq("org_id", workspace_id);

    if (targetsError || !pushTargets || pushTargets.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        message: "No push targets found",
      });
    }

    // Get lead details
    const { data: lead } = await supabase
      .from("contacts")
      .select("first_name, email")
      .eq("id", lead_id)
      .single();

    const leadName = lead?.first_name || lead?.email || "Homeowner";

    // Send push notifications via OneSignal or other provider
    const notificationTitle = "🔥 New HOT Lead";
    const notificationBody = message || `${leadName} wants inspection this week.`;

    // Group by provider
    const onesignalTargets = pushTargets.filter((t) => t.provider === "onesignal");
    const fcmTargets = pushTargets.filter((t) => t.provider === "fcm");

    let sentCount = 0;

    // Send via OneSignal
    if (onesignalTargets.length > 0 && process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) {
      const playerIds = onesignalTargets.map((t) => t.target_id);
      
      try {
        const onesignalRes = await fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
            include_player_ids: playerIds,
            headings: { en: notificationTitle },
            contents: { en: notificationBody },
            data: {
              type: "hot_lead",
              lead_id,
              workspace_id,
            },
            url: `/mobile/inbox`,
          }),
        });

        if (onesignalRes.ok) {
          sentCount += onesignalTargets.length;
        }
      } catch (error) {
        console.error("Error sending OneSignal notification:", error);
      }
    }

    // Send via FCM (Firebase Cloud Messaging)
    if (fcmTargets.length > 0 && process.env.FCM_SERVER_KEY) {
      // TODO: Implement FCM sending
      // For now, log that FCM targets exist
      console.log(`FCM targets found: ${fcmTargets.length}`);
    }

    return NextResponse.json({
      ok: true,
      sent: sentCount,
      targets: pushTargets.length,
    });
  } catch (error: any) {
    console.error("Error sending push notification:", error);
    return NextResponse.json(
      { error: "Failed to send push notification" },
      { status: 500 }
    );
  }
}






































