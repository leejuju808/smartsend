import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") || "";
  const dest = url.searchParams.get("u") || "";
  const safeDest = dest.startsWith("http://") || dest.startsWith("https://") ? dest : "https://example.com";

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: lead } = await supabase.from("leads").select("id,campaign_id").eq("tracking_token", token).maybeSingle();
  if (lead) {
    const ua = ""; const ip = "";
    await supabase.from("email_events").insert({ type: "click", lead_id: lead.id, campaign_id: lead.campaign_id, url: dest, user_agent: ua, ip });
  }

  return NextResponse.redirect(safeDest, { status: 302 });
}


