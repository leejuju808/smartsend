import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

async function getAccountId(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  
  // Try to get account_id from user
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", data.user.id)
    .maybeSingle();
  
  return account?.id;
}

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  try {
    const accountId = await getAccountId(supabase);
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    // Build query for issues (non-sent events)
    let query = supabase
      .from("email_delivery_events")
      .select(`
        id,
        event_type,
        provider_error_code,
        provider_error_message,
        created_at,
        campaign_id,
        contact_id,
        message_id,
        campaigns:campaign_id(name),
        contacts:contact_id(email)
      `)
      .eq("account_id", accountId)
      .neq("event_type", "sent")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    const { data: events, error: eErr } = await query;

    if (eErr) {
      console.error("Error fetching issues:", eErr);
      return NextResponse.json({ error: "Failed to fetch issues" }, { status: 500 });
    }

    // Format issues for frontend
    const issues = (events || []).map((event: any) => {
      const campaignName = event.campaigns?.name || "Unknown Campaign";
      const contactEmail = event.contacts?.email || "Unknown";

      let message = "";
      switch (event.event_type) {
        case "bounced_hard":
          message = `Hard bounce from ${contactEmail} - ${event.provider_error_message || "invalid address"}`;
          break;
        case "bounced_soft":
          message = `Soft bounce from ${contactEmail} - ${event.provider_error_message || "temporary failure"}`;
          break;
        case "dropped_suppressed":
          message = `Suppressed send to ${contactEmail} - blocked by suppression list`;
          break;
        case "send_error":
          message = `Send error - ${event.provider_error_message || event.provider_error_code || "provider error"}`;
          break;
        default:
          message = `${event.event_type} - ${contactEmail}`;
      }

      return {
        id: event.id,
        event_type: event.event_type,
        message,
        campaign_id: event.campaign_id,
        campaign_name: campaignName,
        contact_email: contactEmail,
        timestamp: event.created_at,
        error_code: event.provider_error_code,
        error_message: event.provider_error_message,
      };
    });

    return NextResponse.json({ issues });
  } catch (e: any) {
    const msg = e?.message === "Unauthorized" ? "Unauthorized" : "Server error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
























































