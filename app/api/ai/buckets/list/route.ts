import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const eval_set_id = url.searchParams.get("eval_set_id");
  const model_version_id = url.searchParams.get("model_version_id");

  if (!eval_set_id || !model_version_id) {
    return NextResponse.json(
      { ok: false, error: "eval_set_id and model_version_id are required" },
      { status: 400 }
    );
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await client
    .from("ai_eval_error_buckets")
    .select("bucket, gold_label, pred_label, count:count(*)")
    .eq("eval_set_id", eval_set_id)
    .eq("model_version_id", model_version_id)
    .group("bucket, gold_label, pred_label")
    .order("count", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

















