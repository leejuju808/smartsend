import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/owner/setup-status
 * Check if inbox is set up (email connected, webhook configured)
 */
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

    // Check if user has a verified sending domain/email
    const { data: domainSettings } = await supabase
      .from("domain_settings")
      .select("verification_status, sending_email")
      .eq("user_id", user.id)
      .eq("verification_status", "verified")
      .maybeSingle();

    const hasEmailConnected = !!domainSettings;

    // Check if user has any campaigns (indicates webhook is likely configured)
    const { count: campaignCount } = await supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id);

    // Check if user has any inbox threads (indicates webhook is working)
    const { count: threadCount } = await supabase
      .from("inbox_threads")
      .select("id", { count: "exact", head: true });

    // Check if user has any inbox messages
    const { count: messageCount } = await supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true });

    // Inbox is "live" if:
    // 1. Email is connected AND verified
    // 2. At least one campaign exists (webhook likely configured)
    const isLive = hasEmailConnected && (campaignCount || 0) > 0;
    const hasReplies = (threadCount || 0) > 0 || (messageCount || 0) > 0;

    return NextResponse.json({
      hasEmailConnected,
      hasCampaigns: (campaignCount || 0) > 0,
      hasReplies,
      isLive,
      email: domainSettings?.sending_email || null,
    });
  } catch (error) {
    console.error("Error checking inbox setup status:", error);
    return NextResponse.json(
      { error: "Failed to check setup status" },
      { status: 500 }
    );
  }
}



















































