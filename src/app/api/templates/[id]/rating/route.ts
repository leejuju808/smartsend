import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const body = await req.json();
  const stars = Number(body.stars);
  const comment = body.comment?.slice(0, 500) ?? null;
  
  if (stars < 1 || stars > 5) {
    return NextResponse.json({ error: "Stars must be 1-5" }, { status: 400 });
  }

  const { error } = await supabase.from("template_ratings").upsert({
    template_id: params.id,
    user_id: user.id,
    stars,
    comment
  }, { onConflict: "template_id,user_id" });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ ok: true });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServer();
  
  const { data, error } = await supabase
    .from("template_ratings")
    .select("stars, comment, created_at, user_id")
    .eq("template_id", params.id)
    .order("created_at", { ascending: false });
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ ratings: data });
}