import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const { name, dailyCap } = await req.json();
  const cookieStore = cookies();
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies:{ get:(k)=>cookieStore.get(k)?.value }});
  const { data:{ user }} = await sb.auth.getUser(); 
  if(!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  const { data, error } = await sb.from("sequences").insert({
    name,
    daily_cap: dailyCap,
    user_id: user.id,
    active: true
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}