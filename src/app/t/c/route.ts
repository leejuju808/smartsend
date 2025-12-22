import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sl = u.searchParams.get("sl");       // send_log_id
  const url = u.searchParams.get("u");       // destination (encoded)
  const tk = u.searchParams.get("tk");

  if (!sl || !url || !tk) {
    return new Response("Bad Request", { status: 400 });
  }

  const dest = decodeURIComponent(url);

  const payload = `click:${sl}:${dest}`;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: ok } = await admin.rpc("_verify", { 
    p: payload, 
    tok: tk 
  });

  if (ok) {
    const { data: log } = await admin
      .from("send_logs")
      .select("id, campaign_id, lead_id")
      .eq("id", sl)
      .maybeSingle();

    if (log) {
      const ua = req.headers.get("user-agent") || "";
      const ipHeader = req.headers.get("x-forwarded-for") || 
                       req.headers.get("cf-connecting-ip") || 
                       "";
      const ip = ipHeader.split(",")[0].trim() || null;

      await admin.rpc("_record_tracking", {
        p_kind: "click",
        p_campaign: log.campaign_id,
        p_send_log: log.id,
        p_lead: log.lead_id,
        p_url: dest,
        p_ua: ua,
        p_ip: ip,
        p_meta: {}
      }).catch(() => {});
    }
  }

  return Response.redirect(dest, 302);
}
