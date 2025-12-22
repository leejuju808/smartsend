import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const campaignId = url.searchParams.get("campaignId");
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") || 20), 100);
  const offset = (page - 1) * pageSize;

  const supabase = getServerSupabase();

  // Base query
  let query = supabase
    .from("leads")
    .select("id,email,first_name,last_name,company,campaign_id,last_reply_at,last_reply_snippet,thread_id", { count: "exact" })
    .eq("status", "replied")
    .eq("inbox_archived", false);

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (q) {
    // simple multi-field ilike search
    const like = `%${q}%`;
    query = query.or(`email.ilike.${like},company.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`);
  }

  const { data, count, error } = await query
    .order("last_reply_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    items: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  });
}
