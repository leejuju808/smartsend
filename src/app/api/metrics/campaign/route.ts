import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/server";



export async function GET(req: NextRequest) {

  try {

    const { searchParams } = new URL(req.url);

    const campaignId = searchParams.get("campaignId");

    if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });



    const supabase = supabaseAdmin();

    const { data, error } = await supabase.rpc("campaign_metrics", { p_campaign_id: campaignId });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });



    return NextResponse.json({ metrics: data });

  } catch (e: any) {

    return NextResponse.json({ error: e?.message ?? "server_error" }, { status: 500 });

  }

}

