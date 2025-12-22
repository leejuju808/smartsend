import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || 1);
  const size = Number(url.searchParams.get("size") || 20);
  const from = (page-1)*size, to = from + size - 1;

  const { data, error, count } = await supabase
    .from("import_jobs")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ jobs: data ?? [], page, size, total: count ?? 0 });
}



