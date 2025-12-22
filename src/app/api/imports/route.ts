import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { filename, rows } = await req.json(); // rows: Array<Record<string,string>>
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "no rows" }, { status: 400 });
  }

  const { data: job, error: jerr } = await supabase
    .from("import_jobs").insert({ user_id: user.id, filename, total_rows: rows.length }).select("*").single();
  if (jerr) return NextResponse.json({ error: jerr.message }, { status: 400 });

  // Stage rows
  const staged = rows.slice(0, 5000).map((r, i) => ({
    job_id: job.id,
    row_no: i + 1,
    raw: r
  }));
  const { error: rerr } = await supabase.from("import_rows").insert(staged);
  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 400 });

  return NextResponse.json({ job_id: job.id, total: rows.length });
}



