import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const project_id = url.searchParams.get("project_id")!;
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "all";
  const page = parseInt(url.searchParams.get("page") || "1");
  const size = parseInt(url.searchParams.get("size") || "50");

  const s = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => cookies() }
  );

  let query = s.from("replies").select("id,lead_id,subject,from_email,body,received_at,status,assigned_to", { count: "exact" })
    .eq("project_id", project_id);

  if (q) query = query.ilike("body", `%${q}%`);
  if (status !== "all") query = query.eq("status", status);

  query = query.order("received_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}

