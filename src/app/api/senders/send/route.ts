import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { gmailSend } from "@/lib/senders/gmail";
import { outlookSend } from "@/lib/senders/outlook";

// This is called by the sendDaemon Deno function
export async function POST(req: NextRequest) {
  // Verify request is from our system (e.g., via service role or secret)
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.SEND_DAEMON_SECRET;
  
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { queueId, campaignId } = await req.json();
    
    if (!queueId || !campaignId) {
      return NextResponse.json({ error: "Missing queueId or campaignId" }, { status: 400 });
    }

    // Fetch campaign's sender profile and user_id
    const { data: campaign, error: campError } = await supabaseAdmin
      .from("campaigns")
      .select("id, sender_profile_id, user_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!campaign.sender_profile_id) {
      return NextResponse.json({ error: "No sender_profile configured for this campaign" }, { status: 400 });
    }

    // Fetch sender profile with decryption info
    const { data: profile, error: profError } = await supabaseAdmin
      .from("sender_profiles")
      .select("id, provider, email, access_token, refresh_token, expires_at")
      .eq("id", campaign.sender_profile_id)
      .maybeSingle();

    if (profError || !profile) {
      return NextResponse.json({ error: "Sender profile not found" }, { status: 404 });
    }

    // Fetch queue item
    const { data: item, error: itemError } = await supabaseAdmin
      .from("send_queue")
      .select("id, to_email, subject, body_html")
      .eq("id", queueId)
      .maybeSingle();

    if (itemError || !item) {
      return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
    }

    // Send based on provider
    try {
      if (profile.provider === "gmail") {
        await gmailSend({
          profile: {
            email: profile.email,
            access_token: profile.access_token,
            refresh_token: profile.refresh_token,
            expires_at: profile.expires_at
          },
          to: item.to_email,
          subject: item.subject,
          html: item.body_html,
          userId: campaign.user_id
        });
      } else if (profile.provider === "outlook") {
        await outlookSend({
          profile: {
            email: profile.email,
            access_token: profile.access_token,
            refresh_token: profile.refresh_token,
            expires_at: profile.expires_at
          },
          to: item.to_email,
          subject: item.subject,
          html: item.body_html,
          campaignId: item.campaign_id
        });
      } else {
        return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
      }

      return NextResponse.json({ ok: true, provider: profile.provider });
    } catch (sendError: any) {
      return NextResponse.json({ 
        error: sendError.message || "Send failed",
        provider: profile.provider
      }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

