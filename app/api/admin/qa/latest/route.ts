import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const JSON_HEADERS = { "content-type": "application/json" };

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500, headers: JSON_HEADERS }
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: run, error: runError } = await supabase
    .from("qa_runs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    return NextResponse.json(
      { error: runError.message },
      { status: 500, headers: JSON_HEADERS }
    );
  }

  if (!run?.id) {
    return NextResponse.json({}, { status: 200, headers: JSON_HEADERS });
  }

  const [{ data: acc }, { data: goldAcc }, { data: conf }, { data: pr }] =
    await Promise.all([
      supabase
        .from("v_qa_accuracy")
        .select("run_id,accuracy,total")
        .eq("run_id", run.id)
        .maybeSingle(),
      supabase
        .from("v_qa_gold_accuracy")
        .select("run_id,accuracy,total")
        .eq("run_id", run.id)
        .maybeSingle(),
      supabase
        .from("v_qa_confusion")
        .select("actual_label,predicted_label,n")
        .eq("run_id", run.id),
      supabase
        .from("v_qa_pr")
        .select("label,precision,recall,support")
        .eq("run_id", run.id),
    ]);

  return NextResponse.json(
    {
      run_id: run.id,
      accuracy: acc ?? null,
      gold_accuracy: goldAcc ?? null,
      confusion: conf ?? [],
      pr: pr ?? [],
    },
    { status: 200, headers: JSON_HEADERS }
  );
}







