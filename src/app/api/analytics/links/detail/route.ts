import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ items: [] });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ items: mockLinkDetail() });

  const sb = createClient(supabaseUrl, supabaseKey);
  const [domain, ...rest] = url.split("/");
  const path = "/" + rest.join("/");

  const { data, error } = await sb
    .from("email_events")
    .select("created_at")
    .eq("event_type", "clicked")
    .eq("clicked_domain", domain)
    .eq("clicked_path", path)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ items: mockLinkDetail() });

  // bucket by day
  const buckets: Record<string, number> = {};
  (data ?? []).forEach((r:any)=> {
    const d = new Date(r.created_at).toISOString().slice(0,10);
    buckets[d] = (buckets[d] || 0) + 1;
  });
  const items = Object.entries(buckets).map(([date, clicks])=> ({ date, clicks })).sort((a,b)=> a.date.localeCompare(b.date));

  return NextResponse.json({ items });
}

function mockLinkDetail() {
  const now = new Date();
  return Array.from({ length: 14 }).map((_,i)=> ({
    date: new Date(now.getTime() - (13-i)*24*60*60*1000).toISOString().slice(0,10),
    clicks: Math.floor(2 + Math.random()*10),
  }));
}