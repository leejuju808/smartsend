import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await sb
    .from("marketplace_templates")
    .select(`
      *,
      mv_template_stats:mv_template_stats!inner(template_id, installs, avg_stars, ratings_count)
    `)
    .eq("id", params.id)
    .single();
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  
  return NextResponse.json(data);
} 