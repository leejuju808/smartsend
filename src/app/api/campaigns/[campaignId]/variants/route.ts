// app/api/campaigns/[campaignId]/variants/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(_:any, { params }: { params: { campaignId: string } }) {
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

  const { data, error } = await supabase.from("campaign_variants").select("*").eq("campaign_id", params.campaignId).order("key");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ variants: data });
}