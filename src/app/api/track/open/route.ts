import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkMultiOpenSignal } from "@/lib/intent-signals";

export const runtime = "edge";

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

// 1x1 transparent GIF (base64)
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs="), c => c.charCodeAt(0));

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cid = searchParams.get("cid");
    const lid = searchParams.get("lid");
    const ua = req.headers.get("user-agent") || "";

    // Support legacy params for backward compatibility
    const logId = searchParams.get("e") || searchParams.get("m");

    // If new params are provided, use new email_events structure
    if (cid && lid) {
      const supabase = supabaseAdmin();
      
      // Get org_id from campaign and find variant_id from most recent send
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("org_id")
        .eq("id", cid)
        .single();
      
      // Find variant_id from most recent send_queue or send_logs for this lead/campaign
      const { data: recentSend } = await supabase
        .from("send_queue")
        .select("variant_id")
        .eq("campaign_id", cid)
        .eq("lead_id", lid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const variantId = recentSend?.variant_id || null;
      
      // Insert into email_events
      await supabase.from("email_events").insert({
        campaign_id: cid,
        lead_id: lid,
        variant_id: variantId,
        event: "open",
        meta: { ua },
      });
      
      // Increment variant opens metric if variant_id exists
      if (variantId) {
        await supabase.rpc("increment_variant_metric", {
          p_variant_id: variantId,
          p_metric: "opens",
        }).catch((err) => {
          console.error("Failed to increment variant opens:", err);
        });
      }

      // Log timeline event for email open
      await supabase.from("lead_timeline_events").insert({
        lead_id: lid,
        event_type: "email_open",
        metadata: { campaign_id: cid }
      }).catch((err) => {
        console.error("Failed to log timeline event:", err);
      });
      
      // Also record in lead_events for scoring (if org_id exists)
      if (campaign?.org_id) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/lead-intent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            org_id: campaign.org_id,
            lead_id: lid,
            event_type: "open",
            metadata: { ua },
          }),
        }).catch(err => console.error("Failed to record lead event:", err));

        // Check for multi-open intent signal (>= 3 opens)
        await checkMultiOpenSignal(lid, campaign.org_id);
      }
    }
    // Legacy support: If using legacy 'm' param (message_id), look up email_log_id
    else if (logId) {
      const supabase = supabaseAdmin();
      let emailLogId = logId;
      if (searchParams.get("m")) {
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("id")
          .eq("message_id", logId)
          .single();
        emailLogId = emailLog?.id;
      }

      if (emailLogId) {
        // Insert event (trigger will handle rollup on email_logs)
        await supabase.from("email_events").insert({
          email_log_id: emailLogId,
          event_type: "open",
          user_agent: ua,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0",
        });

        // Get lead_id from email_logs for timeline event
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("lead_id, campaign_id")
          .eq("id", emailLogId)
          .maybeSingle();

        if (emailLog?.lead_id) {
          // Log timeline event for email open
          await supabase.from("lead_timeline_events").insert({
            lead_id: emailLog.lead_id,
            event_type: "email_open",
            metadata: { campaign_id: emailLog.campaign_id || null }
          }).catch((err) => {
            console.error("Failed to log timeline event:", err);
          });
        }
      }
    }

    // Return the pixel
    return new NextResponse(PIXEL, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch {
    return new NextResponse(PIXEL, {
      status: 200,
      headers: { "Content-Type": "image/gif" },
    });
  }
}
