import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: lead } = await supabase.from("leads").select("id,campaign_id").eq("tracking_token", params.token).maybeSingle();
  if (!lead) {
    return new NextResponse(renderHtml("Unsubscribe", "<p>We couldn't find your subscription.</p>"), { headers: { "Content-Type": "text/html" } });
  }

  await Promise.all([
    supabase.from("leads").update({ unsubscribed: true, status: "unsubscribed" }).eq("id", lead.id),
    supabase.from("email_events").insert({ type: "unsub", lead_id: lead.id, campaign_id: lead.campaign_id }),
    supabase.from("send_queue").update({ status: "canceled", reason: "unsubscribed" }).eq("lead_id", lead.id).in("status", ["queued","scheduled"])
  ]);

  return new NextResponse(
    renderHtml("You're unsubscribed",
      "<p>You've been unsubscribed and won't receive future emails from this campaign.</p>"),
    { headers: { "Content-Type": "text/html" } }
  );
}

function renderHtml(title: string, bodyHtml: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/></head>
  <body style="font-family:ui-sans-serif,system-ui;margin:40px;max-width:680px">
    <h1>${title}</h1>
    ${bodyHtml}
  </body></html>`;
}


