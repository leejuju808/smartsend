import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "../_lib/tokens.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });
const SECRET = Deno.env.get("TRACKING_SECRET")!;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t") || "";
    const destB64 = url.searchParams.get("u") || ""; // base64url of destination
    if (!token || !destB64) throw new Error("missing params");
    
    const data = await verify(token, SECRET); // { tracking_token, campaign_id, lead_id, send_log_id }
    
    // Decode base64url: add padding if needed
    let base64 = destB64.replace(/-/g,'+').replace(/_/g,'/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const dest = decodeURIComponent(atob(base64));

    const ua = req.headers.get("user-agent") || "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "";

    await sb.from("tracking_events").insert({
      campaign_id: data.campaign_id,
      account_id: data.account_id ?? null,
      send_log_id: data.send_log_id,
      lead_id: data.lead_id,
      type: "click",
      url: dest,
      ua, ip
    });

    return Response.redirect(dest, 302);
  } catch {
    return new Response("Bad link", { status: 400 });
  }
});

