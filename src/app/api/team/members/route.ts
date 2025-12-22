import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const org_id = searchParams.get("org_id");
  
  if (!org_id) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  
  const { data: rows } = await supabase
    .from("organization_members")
    .select("role,user_id, users:auth.users(email)")
    .eq("org_id", org_id);

  const members = (rows||[]).map((r:any)=>({ 
    role: r.role, 
    user_id: r.user_id, 
    email: r.users?.email 
  }));
  
  return NextResponse.json({ members });
}
