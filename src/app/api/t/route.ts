import { NextRequest, NextResponse } from "next/server";
import { verify, ClickPayload } from "@/lib/tracking/token";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { updateLeadScore } from "@/lib/lead-scoring";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const t = searchParams.get("t");
  const fallback = "/";
  
  try {
    const p = t ? verify<ClickPayload>(t) : null;
    if (!p?.url || !p.email_log_id) {
      return NextResponse.redirect(fallback, { status: 302 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0] || null;
    const ua = req.headers.get("user-agent") || null;

    // Fetch email_log to get campaign_id and lead_id
    const { data: logData } = await supabase
      .from("email_logs")
      .select("campaign_id, lead_id, message_id, clicked, workspace_id")
      .eq("id", p.email_log_id)
      .single();

    // Insert click event with enriched data
    await supabase.from("email_events").insert({
      email_log_id: p.email_log_id,
      event_type: "click",
      url: p.url,
      campaign_id: logData?.campaign_id || null,
      lead_id: logData?.lead_id || null,
      message_id: logData?.message_id || null,
      ip,
      ua
    });

    // Log timeline event for email click
    if (logData?.lead_id) {
      await supabase.from("lead_timeline_events").insert({
        lead_id: logData.lead_id,
        event_type: "email_click",
        metadata: {
          campaign_id: logData.campaign_id || null,
          message_id: logData.message_id || null,
          url: p.url
        }
      }).catch((err) => {
        console.error("Failed to log timeline event:", err);
      });
    }

    // Update email_logs to mark as clicked and set timestamp + URL (only if not already clicked)
    if (!logData?.clicked) {
      await supabase
        .from("email_logs")
        .update({ clicked: true, clicked_at: new Date().toISOString(), click_url: p.url })
        .eq("id", p.email_log_id);
    }

    // Update lead score (fire and forget)
    if (logData?.lead_id) {
      updateLeadScore(logData.lead_id, "email_click", logData.workspace_id);
    }

    return NextResponse.redirect(p.url, { status: 302 });
  } catch (error) {
    console.error("Error tracking email click:", error);
    return NextResponse.redirect(fallback, { status: 302 });
  }
} 