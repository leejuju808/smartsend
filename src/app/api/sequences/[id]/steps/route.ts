import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";
export async function GET(_:any,{params}:{params:{id:string}}){
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies:{ get:(k)=>cookies().get(k)?.value }});
  const { data:{ user }} = await sb.auth.getUser(); if(!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const { data, error } = await sb.from("sequence_steps").select("*").eq("sequence_id", params.id).order("position");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ steps: data });
}