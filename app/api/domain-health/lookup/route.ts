import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("domain");
  if (!d) return NextResponse.json({ error: "domain required" }, { status: 400 });
  
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!, 
    { auth: { persistSession: false }}
  );
  
  const { data } = await sb
    .from("domain_health")
    .select("*")
    .eq("domain", d.toLowerCase())
    .maybeSingle();
  
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const { domain } = await req.json();
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });
  
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!, 
    { auth: { persistSession: false }}
  );
  
  await sb.rpc("enqueue_domain_check", { 
    p_domain: domain.toLowerCase(), 
    p_priority: 10 
  });
  
  return NextResponse.json({ ok: true });
}














