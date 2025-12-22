import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "14", 10);
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (isNaN(days) ? 14 : days));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ items: mockTopLinks() });
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  // Aggregate clicks by domain+path and approximate CTR using opened counts baseline
  const { data, error } = await sb
    .from("email_events")
    .select("clicked_domain, clicked_path, count:event_type")
    .eq("event_type", "clicked")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .not("clicked_domain", "is", null)
    .not("clicked_path", "is", null)
    .group("clicked_domain, clicked_path");

  // Baseline opens for rough CTR denominator
  const { data: opens } = await sb
    .from("email_events")
    .select("count")
    .eq("event_type", "opened")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());

  const openedTotal = Array.isArray(opens) && opens.length > 0 && (opens as any)[0]?.count ? (opens as any)[0].count : 0;

  if (error) return NextResponse.json({ items: mockTopLinks() });

  const items = (data ?? []).map((r:any) => {
    const url = `${r.clicked_domain}${r.clicked_path}`;
    const clicks = Number(r.count) || 0;
    const ctr = openedTotal ? +(clicks / openedTotal * 100).toFixed(2) : 0;
    return { url, domain: r.clicked_domain, path: r.clicked_path, clicks, ctr };
  }).sort((a,b)=> b.clicks - a.clicks).slice(0, 20);

  return NextResponse.json({ items });
}

function mockTopLinks() {
  return [
    { url: "smartsend.ai/demo", domain: "smartsend.ai", path: "/demo", clicks: 91, ctr: 7.4 },
    { url: "smartsend.ai/pricing", domain: "smartsend.ai", path: "/pricing", clicks: 63, ctr: 5.1 },
    { url: "cal.com/julian/15", domain: "cal.com", path: "/julian/15", clicks: 37, ctr: 3.0 },
  ];
}