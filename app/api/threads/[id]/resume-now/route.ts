import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase env not configured" },
      { status: 500 }
    );
  }

  const supa = createClient(supabaseUrl, serviceRoleKey);
  const nowIso = new Date().toISOString();

  const { error: threadError } = await supa
    .from("threads")
    .update({ paused_until: null, updated_at: nowIso })
    .eq("id", params.id);

  if (threadError) {
    return NextResponse.json({ ok: false, error: threadError.message }, { status: 500 });
  }

  const { error: jobError } = await supa
    .from("ooo_reentry_jobs")
    .update({ status: "done", updated_at: nowIso })
    .eq("thread_id", params.id)
    .eq("status", "scheduled");

  if (jobError) {
    return NextResponse.json({ ok: false, error: jobError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

