import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const campaign = u.searchParams.get("campaign");
    const step = u.searchParams.get("step");
    const lead = u.searchParams.get("lead");

    if (!campaign || !step || !lead) {
      return NextResponse.json({ error: "campaign, step, and lead required" }, { status: 400 });
    }

    const sb = createClient(supabaseUrl, supabaseAnonKey);
    
    const { data, error } = await sb.rpc("preview_next_send_for_step", {
      p_campaign: campaign,
      p_step_no: Number(step),
      p_lead: lead,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] }, { headers: { "content-type": "application/json" } });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
























