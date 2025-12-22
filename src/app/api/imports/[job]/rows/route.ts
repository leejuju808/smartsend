import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest, { params }: { params: { job: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || 1);
  const size = Number(url.searchParams.get("size") || 100);
  const from = (page-1)*size, to = from + size - 1;

  const { data, error } = await supabase
    .from("import_rows")
    .select("row_no, raw, mapped, issues, is_valid")
    .eq("job_id", params.job)
    .order("row_no", { ascending: true })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data ?? [], page, size });
}



