// Block 31: Unified tracking function for opens and clicks
// Handles pixel tracking (opens) and link-click tracking with redirect
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// 1x1 transparent GIF pixel
const GIF_1x1 = Uint8Array.from(
  atob("R0lGODlhAQABAIABAP///wAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==")
    .split("")
    .map((c) => c.charCodeAt(0))
);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const t = url.searchParams.get("t") || "open"; // t=open or t=click
  const cid = url.searchParams.get("c"); // campaign_id
  const lid = url.searchParams.get("l"); // lead_id
  const pid = url.searchParams.get("p") || "gmail"; // provider
  const redirectUrl = url.searchParams.get("r"); // redirect URL for clicks

  try {
    // Only track if we have campaign_id and lead_id
    if (cid && lid) {
      const eventType = t === "click" ? "clicked" : "opened";
      
      // Get team_id from campaign if available
      const { data: campaign } = await sb
        .from("campaigns")
        .select("team_id")
        .eq("id", cid)
        .maybeSingle();

      await sb.from("campaign_events").insert({
        team_id: campaign?.team_id || null,
        campaign_id: cid,
        lead_id: lid,
        event_type: eventType,
        provider: pid,
        meta: {
          ip: req.headers.get("x-forwarded-for") || null,
          user_agent: req.headers.get("user-agent") || null,
        },
      });
    }
  } catch (e) {
    console.error("trackEvent error:", e);
    // Continue to return pixel/redirect even on tracking error
  }

  // For clicks, redirect to the target URL
  if (t === "click" && redirectUrl) {
    try {
      // Decode the URL if it's base64 encoded
      const decodedUrl = decodeURIComponent(redirectUrl);
      return Response.redirect(decodedUrl, 302);
    } catch {
      // If decode fails, try direct redirect
      return Response.redirect(redirectUrl, 302);
    }
  }

  // For opens, return 1x1 transparent GIF
  return new Response(GIF_1x1, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
});

