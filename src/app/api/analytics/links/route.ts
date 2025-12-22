import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser(); if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const q = new URL(req.url).searchParams;
  const campaignId = q.get("campaignId");

  let query = supabase.from("v_link_clicks_by_url").select("*").eq("workspace_id", u.user.id).order("clicks", { ascending: false }).limit(100);
  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });

  return NextResponse.json({ ok:true, links: data ?? [] });
}