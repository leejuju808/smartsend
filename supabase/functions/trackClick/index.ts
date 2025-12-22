// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t"); // ?t=<uuid>
  const u = url.searchParams.get("u"); // encoded destination
  const dest = u ? decodeURIComponent(u) : "https://smartsendhq.com";
  
  if (token) {
    try {
      const { data } = await supabase.rpc("find_send_by_token", { tok: token });
      if (data && data[0]) {
        const row = data[0];
        const ua = req.headers.get("user-agent") ?? "";
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";

        await supabase.from("email_events").insert({
          event_type: "click",
          user_id: row.user_id,
          campaign_id: row.campaign_id,
          lead_id: row.lead_id,
          send_log_id: row.send_log_id,
          url: dest,
          user_agent: ua,
          ip
        });

        await supabase.rpc("increment_clicks_if_needed", { sid: row.send_log_id });
      }
    } catch {}
  }

  return new Response(null, { status: 302, headers: { Location: dest, "Cache-Control": "no-store" } });
});










