import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

function html(msg: string) {
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial;margin:40px;color:#111}
  .card{max-width:560px;margin:auto;border:1px solid #eee;border-radius:16px;padding:24px}
  .muted{color:#666;font-size:12px}</style>
  <div class="card"><h1>You're unsubscribed</h1><p>${msg}</p>
  <p class="muted">If this was a mistake, reply to the last email and ask to be re-subscribed.</p></div>`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");

  if (!k) return new NextResponse(html("Missing token."), { headers: { "content-type": "text/html" } });

  const { data: msg } = await supabaseAdmin
    .from("outbound_messages")
    .select("id, owner, lead_id")
    .eq("tracking_key", k)
    .maybeSingle();

  if (!msg) return new NextResponse(html("This link is invalid or expired."), { headers: { "content-type": "text/html" } });

  await supabaseAdmin
    .from("leads")
    .update({ unsubscribed: true, unsubscribed_at: new Date().toISOString() })
    .eq("id", (msg as any).lead_id)
    .eq("owner", (msg as any).owner);

  await supabaseAdmin
    .from("send_events")
    .insert({ owner: (msg as any).owner, lead_id: (msg as any).lead_id, sequence_id: null, kind: "unsubscribed" })
    .catch(() => {});

  return new NextResponse(html("We won't email you again."), { headers: { "content-type": "text/html" } });
}

