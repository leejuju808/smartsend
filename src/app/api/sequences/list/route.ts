import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";
export async function GET(){
  const cookieStore = cookies();
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies:{ get:(k)=>cookieStore.get(k)?.value }});
  const { data:{ user }} = await sb.auth.getUser(); if(!user) return NextResponse.json({ sequences: [] });
  const { data, error } = await sb.from("sequences").select("id,name,active,daily_cap,created_at").eq("user_id", user.id).order("created_at",{ascending:false});
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ sequences: data });
}