import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { job: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { mapping } = await req.json();
  if (!mapping?.email) return NextResponse.json({ error: "email mapping required" }, { status: 400 });

  const { error } = await supabase.rpc("validate_import_job", {
    p_job: params.job, p_mapping: mapping, p_user: user.id
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: job } = await supabase.from("import_jobs").select("*").eq("id", params.job).single();
  return NextResponse.json({ ok: true, job });
}



