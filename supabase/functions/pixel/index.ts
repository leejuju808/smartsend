// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function ipOf(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    undefined
  );
}

function classifyUA(uaRaw: string | null, ip?: string) {
  const ua = (uaRaw || "").toLowerCase();

  // Apple MPP & Mail Privacy
  if (ua.includes("apple") && (ua.includes("desktop") || ua.includes("mobile"))) {
    return "apple_mpp";
  }

  // Gmail image proxy
  if (ua.includes("googleimageproxy") || ua.includes("gmailimageproxy")) {
    return "gmail_proxy";
  }

  // Common bots/scanners/CDNs
  const botTerms = [
    "bot",
    "spider",
    "crawler",
    "headless",
    "phantom",
    "uptime",
    "monitor",
    "pingdom",
    "linkchecker",
    "curl/",
    "wget/",
    "python-requests",
    "java/",
    "httpclient",
    "node-fetch",
    "mailgun",
    "sendgrid",
    "resend",
    "brevo",
    "sparkpost",
    "postmanruntime",
  ];
  if (botTerms.some((t) => ua.includes(t))) return "bot";

  // Known cloud egress (rough heuristic if needed)
  if (
    ip &&
    (ip.startsWith("35.") ||
      ip.startsWith("34.") ||
      ip.startsWith("52.") ||
      ip.startsWith("54."))
  ) {
    if (!ua) return "bot";
  }

  // Default browser-ish
  if (
    ua.includes("mozilla/") ||
    ua.includes("chrome") ||
    ua.includes("safari") ||
    ua.includes("firefox")
  ) {
    return "browser";
  }

  return "unknown";
}

const ONE_PX_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0, 33, 249, 4,
  1, 0, 0, 1, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]); // transparent 1x1 GIF

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const pixel = url.pathname.replace(/^\/+/, ""); // /<token>
    if (!pixel || pixel.length > 64) {
      return new Response(ONE_PX_GIF, {
        status: 200,
        headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
      });
    }

    // Lookup pixel config
    const { data: mp } = await supabase
      .from("message_pixels")
      .select("*")
      .eq("pixel", pixel)
      .maybeSingle();
    if (!mp) {
      return new Response(ONE_PX_GIF, {
        status: 200,
        headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
      });
    }

    // Respect opt-out
    if (
      !mp.track_enabled ||
      mp.gdpr_optout ||
      url.searchParams.get("gdpr") === "no_track"
    ) {
      return new Response(ONE_PX_GIF, {
        status: 200,
        headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
      });
    }

    const ip = ipOf(req);
    const ua = req.headers.get("user-agent") ?? null;
    const via = classifyUA(ua, typeof ip === "string" ? ip : undefined);

    // Count rules:
    // - Count 'browser'
    // - Optionally count 'gmail_proxy' first hit only
    // - Do NOT count 'bot'
    let is_counted = via === "browser";
    if (via === "gmail_proxy") {
      // Count only first event for this pixel from gmail proxy
      const { count: gmailCount, error: gmailError } = await supabase
        .from("open_events")
        .select("*", { count: "exact", head: true })
        .eq("pixel", pixel)
        .eq("via", "gmail_proxy");
      if (gmailError) {
        console.error("gmail_proxy count lookup failed", gmailError);
      }
      is_counted = typeof gmailCount === "number" ? gmailCount === 0 : true;
    }

    await supabase.from("open_events").insert({
      account_id: mp.account_id,
      campaign_id: mp.campaign_id,
      lead_id: mp.lead_id,
      message_id: mp.message_id,
      pixel,
      ip,
      ua,
      via,
      is_counted,
    });

    return new Response(ONE_PX_GIF, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch {
    return new Response(ONE_PX_GIF, {
      status: 200,
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
    });
  }
});

