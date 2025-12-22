import { createClient } from "@supabase/supabase-js";

function tinyGif(): Uint8Array {
  const b = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);
  return b;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sl = u.searchParams.get("sl");       // send_log_id
  const em = u.searchParams.get("em");       // recipient email
  const tk = u.searchParams.get("tk");       // token

  if (!sl || !em || !tk) {
    return new Response(tinyGif(), { 
      status: 204, 
      headers: { "content-type": "image/gif", "cache-control": "no-store" }
    });
  }

  const payload = `open:${sl}:${em.toLowerCase()}`;

  // Verify token in SQL to keep logic centralized
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: ok, error: verifyError } = await admin.rpc("_verify", { 
    p: payload, 
    tok: tk 
  });

  if (ok) {
    // fetch send_log for campaign/lead
    const { data: log } = await admin
      .from("send_logs")
      .select("id, campaign_id, lead_id")
      .eq("id", sl)
      .limit(1)
      .maybeSingle();

    if (log) {
      const ua = req.headers.get("user-agent") || "";
      const ipHeader = req.headers.get("x-forwarded-for") || 
                       req.headers.get("cf-connecting-ip") || 
                       "";
      const ip = ipHeader.split(",")[0].trim() || null;

      await admin.rpc("_record_tracking", {
        p_kind: "open",
        p_campaign: log.campaign_id,
        p_send_log: log.id,
        p_lead: log.lead_id,
        p_url: null,
        p_ua: ua,
        p_ip: ip,
        p_meta: {}
      }).catch(() => {});
    }
  }

  return new Response(tinyGif(), { 
    headers: { 
      "content-type": "image/gif", 
      "cache-control": "no-store",
      "pragma": "no-cache"
    }
  });
}
