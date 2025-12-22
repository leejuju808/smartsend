// Deno (Supabase Edge)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(URL_, KEY);

// 1x1 transparent GIF
const GIF = Uint8Array.from([
  71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59
]);

Deno.serve(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const t = searchParams.get("t"); // send_id/email_id token (signed by you) OR simple uuid
    const a = searchParams.get("a"); // account_id
    const c = searchParams.get("c"); // campaign_id
    const e = searchParams.get("e"); // email_id
    const l = searchParams.get("l"); // lead_id

    // Log event (best-effort)
    await sb.from("email_events").insert({
      account_id: a ?? null,
      campaign_id: c ?? null,
      send_id: t ?? null,
      email_id: e ?? null,
      lead_id: l ?? null,
      kind: "open",
      user_agent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null
    });

    return new Response(GIF, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, must-revalidate, max-age=0",
        "Content-Length": String(GIF.length)
      }
    });
  } catch {
    return new Response(GIF, { headers: { "Content-Type": "image/gif" } });
  }
});
