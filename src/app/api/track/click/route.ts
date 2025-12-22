import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkMultiClickSignal } from "@/lib/intent-signals";

export const runtime = "edge";

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cid = url.searchParams.get("cid");
  const lid = url.searchParams.get("lid");
  const t = url.searchParams.get("t"); // target
  
  // Legacy support
  const logId = url.searchParams.get("e") || url.searchParams.get("m");
  const target = url.searchParams.get("u"); // legacy encoded destination
  const ua = req.headers.get("user-agent") || "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0";

  // Validate + decode destination
  let dest: string | null = null;
  if (t) {
    dest = decodeURIComponent(t);
  } else if (target) {
    dest = decodeURIComponent(target);
  }

  // Default safe redirect home if anything is off
  const safeRedirect = (to?: string) =>
    NextResponse.redirect(to ?? "https://smartsendhq.com", 302);

  try {
    if (!dest) return safeRedirect();

    const supabase = supabaseAdmin();

    // New structure: use campaign_id and lead_id
    if (cid && lid) {
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
      
      await supabase.from("email_events").insert({
        campaign_id: cid,
        lead_id: lid,
        variant_id: variantId,
        event: "click",
        meta: { target: dest },
      });
      
      // Increment variant clicks metric if variant_id exists
      if (variantId) {
        await supabase.rpc("increment_variant_metric", {
          p_variant_id: variantId,
          p_metric: "clicks",
        }).catch((err) => {
          console.error("Failed to increment variant clicks:", err);
        });
      }
      
      // Get org_id and record in lead_events for scoring
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("org_id")
        .eq("id", cid)
        .single();
      
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
            event_type: "click",
            metadata: { target: dest },
          }),
        }).catch(err => console.error("Failed to record lead event:", err));

        // Check for multi-click intent signal (>= 2 clicks)
        await checkMultiClickSignal(lid, campaign.org_id);
      }
    }
    // Legacy support
    else if (logId) {
      // If using legacy 'm' param (message_id), look up email_log_id
      let emailLogId = logId;
      if (url.searchParams.get("m")) {
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("id")
          .eq("message_id", logId)
          .single();
        emailLogId = emailLog?.id;
      }

      if (emailLogId) {
        await supabase.from("email_events").insert({
          email_log_id: emailLogId,
          event_type: "click",
          link_url: dest,
          user_agent: ua,
          ip,
        });
      }
    }

    return safeRedirect(dest);
  } catch (e) {
    return safeRedirect(dest ?? undefined);
  }
}
