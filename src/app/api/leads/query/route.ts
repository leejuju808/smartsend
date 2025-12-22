import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const campaign_id = url.searchParams.get("campaign_id");
  const date_from = url.searchParams.get("date_from");
  const date_to = url.searchParams.get("date_to");
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Math.min(Number(url.searchParams.get("page_size") ?? 25), 100);

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get(name) { return cookies().get(name)?.value; } }
  });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("leads").select("id,email,first_name,last_name,company,status,campaign_id,created_at", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (status) query = query.eq("status", status);
  if (campaign_id) query = query.eq("campaign_id", campaign_id);
  if (date_from) query = query.gte("created_at", date_from);
  if (date_to) query = query.lte("created_at", date_to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, page, pageSize, total: count ?? 0 });
}

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const campaign_id = url.searchParams.get("campaign_id");
  const date_from = url.searchParams.get("date_from");
  const date_to = url.searchParams.get("date_to");
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Math.min(Number(url.searchParams.get("page_size") ?? 25), 100);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name) { return cookies().get(name)?.value; } } }
  );

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("leads")
    .select("id,email,first_name,last_name,company,status,campaign_id,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status) query = query.eq("status", status);
  if (campaign_id) query = query.eq("campaign_id", campaign_id);
  if (date_from) query = query.gte("created_at", date_from);
  if (date_to) query = query.lte("created_at", date_to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, page, pageSize, total: count ?? 0 });
}


