import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest, 
  { params }: { params: { token: string }}
) {
  const supabase = supabaseAdmin();
  
  // token = base64url of {l: lead_id, c: campaign_id, o: org_id}
  try {
    const j = JSON.parse(Buffer.from(params.token, "base64url").toString("utf8"));

    // Set unsubscribed_at on lead
    await supabase
      .from("leads")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("id", j.l);

    // Cancel future queued jobs for this lead
    await supabase
      .from("send_queue")
      .update({ state: "paused", last_error: "Unsubscribed" })
      .eq("lead_id", j.l)
      .in("state", ["queued", "sending"]);

    // Return simple confirmation page
    return new NextResponse(`<html><body style="font-family:Inter;padding:24px">
      <h2>You've been unsubscribed.</h2>
      <p>You won't receive future emails from this campaign.</p>
    </body></html>`, { headers: { "Content-Type": "text/html" }});
  } catch {
    return NextResponse.redirect("/", { status: 302 });
  }
}

