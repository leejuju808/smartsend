import { NextRequest, NextResponse } from "next/server";

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaign = new URL(req.url).searchParams.get("campaign") ?? undefined;

  if (!campaign) {
    return NextResponse.json({ presets: [] });
  }

  const { data, error } = await supabase
    .from("rewrite_presets")
    .select("id,name,tone,style,max_len,cta_hint")
    .eq("campaign_id", campaign)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ presets: [] });
  }

  return NextResponse.json({ presets: data ?? [] });
}





