import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(URL_, KEY);

Deno.serve(async (req) => {
  try {
    const { pathname, searchParams } = new URL(req.url);
    const token = pathname.split("/").pop(); // /track-click/<token>
    const a = searchParams.get("a"); // account_id
    const c = searchParams.get("c"); // campaign_id
    const s = searchParams.get("s"); // send_id
    const e = searchParams.get("e"); // email_id
    const l = searchParams.get("l"); // lead_id

    const { data: link } = await sb.from("tracking_links").select("dest_url,account_id,campaign_id,send_id,email_id,lead_id").eq("token", token!).single();

    // log click even if token missing dest (we'll still 404 safely)
    await sb.from("email_events").insert({
      account_id: a ?? link?.account_id ?? null,
      campaign_id: c ?? link?.campaign_id ?? null,
      send_id: s ?? link?.send_id ?? null,
      email_id: e ?? link?.email_id ?? null,
      lead_id: l ?? link?.lead_id ?? null,
      kind: "click",
      url: link?.dest_url ?? null,
      user_agent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null
    });

    if (!link?.dest_url) {
      return new Response("Not found", { status: 404 });
    }

    return Response.redirect(link.dest_url, 302);
  } catch (err) {
    return new Response("Error", { status: 500 });
  }
});
