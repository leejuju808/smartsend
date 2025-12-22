import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * API route to register a push notification target (device token/player ID)
 * 
 * This endpoint is called from the frontend when a user's device is ready
 * to receive push notifications (e.g., after OneSignal initialization).
 * 
 * POST /api/push/register
 * Body: {
 *   provider: "onesignal" | "fcm" | etc.
 *   target_id: string (player_id, token, etc.)
 *   org_id: string
 *   device_label?: string
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const { provider, target_id, org_id, device_label } = body;

    if (!provider || !target_id || !org_id) {
      return new NextResponse(
        JSON.stringify({ error: "Missing required fields: provider, target_id, org_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = session.user.id;

    // Upsert push target (update if exists, insert if new)
    const { error } = await supabase
      .from("user_push_targets")
      .upsert(
        {
          user_id: userId,
          org_id,
          provider,
          target_id,
          device_label: device_label || null,
          last_seen_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,org_id,provider,target_id",
          ignoreDuplicates: false,
        }
      );

    if (error) {
      console.error("Failed to register push target", error);
      return new NextResponse(
        JSON.stringify({ error: "Failed to register push target", details: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in push register endpoint", error);
    return new NextResponse(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

