import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || "20");
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data } = await supabase
    .from("campaign_leads")
    .select("lead_id, leads:lead_id(id,name,company,email)")
    .eq("campaign_id", params.id)
    .limit(limit);
  
  const rows = (data || []).map((r: any) => r.leads);
  return NextResponse.json({ rows });
}

