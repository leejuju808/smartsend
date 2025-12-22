import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  let query = supabase
    .from("leads")
    .select("domain")
    .eq("user_id", user.id)
    .not("domain", "is", null);
  
  if (q) query = query.ilike("domain", `%${q}%`);
  
  const { data, error } = await query.limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const unique = Array.from(new Set((data ?? []).map(d => d.domain).filter(Boolean))).slice(0, 20);
  return NextResponse.json({ domains: unique });
}



