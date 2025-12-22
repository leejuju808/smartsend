// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// 1x1 transparent PNG bytes
const PNG_BYTES = new Uint8Array([
  0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
  0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,
  0x89,0x00,0x00,0x00,0x0A,0x49,0x44,0x41,0x54,0x78,0xDA,0x63,0x60,0x00,0x00,0x00,
  0x02,0x00,0x01,0xE5,0x27,0xD4,0xA2,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,
  0x42,0x60,0x82
]);

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t"); // ?t=<uuid>
    if (token) {
      const { data, error } = await supabase.rpc("find_send_by_token", { tok: token });
      if (!error && data && data[0]) {
        const row = data[0];
        const ua = req.headers.get("user-agent") ?? "";
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";

        await supabase.from("email_events").insert({
          event_type: "open",
          user_id: row.user_id,
          campaign_id: row.campaign_id,
          lead_id: row.lead_id,
          send_log_id: row.send_log_id,
          user_agent: ua,
          ip
        });

        // idempotent: set opened_at if null and increment count
        await supabase.rpc("increment_opens_if_needed", { sid: row.send_log_id });
      }
    }
  } catch {}

  return new Response(PNG_BYTES, {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store, max-age=0" }
  });
});










