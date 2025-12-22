import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("marketplace_templates")
    .select(`
      id, name, description, kind, tags, is_paid, price_cents, 
      author, rating, installs, created_at, updated_at,
      mv_template_stats:mv_template_stats(template_id, installs, avg_stars, ratings_count)
    `)
    .eq("author", user.email) // Assuming author is stored as email
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ templates: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, published } = body;

  const { error } = await supabase
    .from("marketplace_templates")
    .update({ published })
    .eq("id", id)
    .eq("author", user.email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}