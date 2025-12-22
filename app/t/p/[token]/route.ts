import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const GIF_1X1 = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,1,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Try to resolve the lead via token
  const { data: lead } = await supabase.from("leads").select("id,campaign_id").eq("tracking_token", params.token).maybeSingle();
  if (lead) {
    const ip = "0.0.0.0"; // Edge runtime: omit or pull via middleware if desired
    const ua = "open";
    await supabase.from("email_events").insert({
      type: "open",
      lead_id: lead.id,
      campaign_id: lead.campaign_id,
      ip, user_agent: ua
    });
  }

  return new NextResponse(GIF_1X1, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    }
  });
}


