import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").toLowerCase();
  const tag = url.searchParams.get("tag");
  const category = url.searchParams.get("category");
  const sort = url.searchParams.get("sort") || "installs";
  
  let query = sb
    .from("marketplace_templates")
    .select(`
      *,
      mv_template_stats:mv_template_stats!inner(template_id, installs, avg_stars, ratings_count)
    `);
  
  // Apply filters
  if (tag) {
    query = query.contains("tags", [tag]);
  }
  
  if (category) {
    query = query.contains("tags", [category]);
  }
  
  // Apply sorting
  switch (sort) {
    case "rating":
      query = query.order("mv_template_stats.avg_stars", { ascending: false });
      break;
    case "new":
      query = query.order("created_at", { ascending: false });
      break;
    case "name":
      query = query.order("name", { ascending: true });
      break;
    case "installs":
    default:
      query = query.order("mv_template_stats.installs", { ascending: false });
      break;
  }
  
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  
  // Filter by search query if provided (client-side for better performance with pg_trgm)
  let filtered = data || [];
  
  if (q) {
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q) ||
      (t.tags || []).some((x: string) => x.toLowerCase().includes(q))
    );
  }
  
  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  // Admin/author publish
  const body = await req.json();
  const { data, error } = await sb.from("marketplace_templates").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
} 