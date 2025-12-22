import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title>
      <style>body{font-family:ui-sans-serif,system-ui;padding:32px;background:#0b0b0b;color:#e5e5e5}
      .card{max-width:560px;margin:auto;background:#111;border:1px solid #222;border-radius:16px;padding:24px}
      .ok{color:#22c55e}.muted{color:#9ca3af}</style></head><body><div class="card">${body}</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" }, status }
  );
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const sid = url.searchParams.get("sid"); // send_logs.id
    const t   = url.searchParams.get("t");   // send_logs.unsubscribe_token

    if (!sid || !t) return html("<h2>Missing link data</h2><p class='muted'>Please contact the sender.</p>", 400);

    // Look up send log & validate token
    const { data: sl, error: slErr } = await sb
      .from("send_logs")
      .select("id, unsubscribe_token, campaign_id, lead_id, thread_id")
      .eq("id", sid)
      .maybeSingle();
    if (slErr || !sl) return html("<h2>Invalid link</h2>", 400);
    if (sl.unsubscribe_token !== t) return html("<h2>Invalid or expired token</h2>", 400);

    // Resolve owner + lead contact
    const { data: c } = await sb
      .from("campaigns")
      .select("user_id")
      .eq("id", sl.campaign_id)
      .maybeSingle();
    const userId = c?.user_id as string | undefined;

    const { data: lead } = await sb
      .from("leads")
      .select("email, domain")
      .eq("id", sl.lead_id)
      .maybeSingle();

    if (!userId || !lead) return html("<h2>Could not resolve your subscription</h2>", 400);

    // Upsert suppression
    await sb.rpc("upsert_suppression", {
      p_user: userId,
      p_email: lead.email,
      p_domain: null,
      p_source: "link",
      p_note: `send_log=${sl.id}`
    });

    // Stop any future sends
    if (sl.thread_id) {
      await sb.rpc("mark_thread_replied", { p_thread: sl.thread_id, p_at: new Date().toISOString() });
    }

    // Optional: flag latest inbound/insert a system note in thread (if you have a notes table)

    return html("<h2 class='ok'>You're unsubscribed.</h2><p class='muted'>We won't email you again.</p>", 200);
  } catch (e) {
    return html("<h2>Something went wrong</h2><p class='muted'>Please try again later.</p>", 500);
  }
});
