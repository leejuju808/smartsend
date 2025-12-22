import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: NextRequest, { params }: { params: { job: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("import_jobs").select("*").eq("id", params.job).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (data.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ job: data });
}

export async function DELETE(_: NextRequest, { params }: { params: { job: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.rpc("delete_import_job", { p_job: params.job, p_user: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}



