// app/api/campaigns/[campaignId]/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(_:NextRequest,{params}:{params:{campaignId:string}}){
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: { 
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {}
      } 
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("v_campaign_variant_metrics").select("*").eq("campaign_id", params.campaignId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ variants: data });
}