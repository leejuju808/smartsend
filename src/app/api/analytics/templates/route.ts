import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabaseServer();
  
  const { data, error } = await supabase
    .from("mv_template_stats")
    .select(`
      template_id,
      installs,
      avg_stars,
      ratings_count,
      marketplace_templates!inner(name, author)
    `)
    .order("installs", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Flatten the joined data
  const rows = data?.map((item: any) => ({
    template_id: item.template_id,
    title: item.marketplace_templates?.name,
    author: item.marketplace_templates?.author,
    installs: item.installs,
    avg_stars: item.avg_stars,
    ratings_count: item.ratings_count
  })) || [];

  return NextResponse.json({ rows });
}