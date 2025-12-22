import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { template_id, stars } = await req.json();
  if (!template_id || !stars) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { error } = await supabase.from("template_ratings").upsert({
    template_id,
    user_id: user.id,
    stars: Math.min(5, Math.max(1, Number(stars)))
  }, { onConflict: "template_id,user_id" });
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
} 