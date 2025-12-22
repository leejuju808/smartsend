// app/api/campaigns/[campaignId]/variants/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }){
  const { variants } = await req.json(); // [{key, weight_pct, subject_template, html_template}]
  
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

  await supabase.from("campaign_variants").delete().eq("campaign_id", params.campaignId);
  const { error } = await supabase.from("campaign_variants").insert(
    (variants||[]).map((v:any)=>({ campaign_id: params.campaignId, ...v }))
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok:true });
}