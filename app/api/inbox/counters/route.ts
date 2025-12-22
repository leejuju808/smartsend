import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const requestUrl = new URL(req.url);
  const campaignId =
    requestUrl.searchParams.get("campaign_id") ?? process.env.NEXT_PUBLIC_CAMPAIGN_ID;

  if (!url || !serviceKey || !campaignId) {
    return NextResponse.json({ error: "missing_supabase_config" }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey);
  const { data, error } = await supabase
    .from("v_inbox_label_counts")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? {});
}

