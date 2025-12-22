import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/eval/sets/[id]/runs - List runs for an eval set
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: runs, error } = await sb
    .from("eval_runs")
    .select("id, created_at, model, pack_version, macro_f1, accuracy, pack_id, pack_kind")
    .eq("eval_set_id", params.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ runs: runs || [] });
}

// POST /api/eval/sets/[id]/runs - Run evaluation
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { pack_id, pack_version, model, params: runParams } = body;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Call eval-runner edge function
  const response = await fetch(`${supabaseUrl}/functions/v1/eval-runner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      eval_set_id: params.id,
      pack_id: pack_id || null,
      pack_version: pack_version || null,
      model: model || "rules",
      params: runParams || null,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    return NextResponse.json(result, { status: response.status });
  }

  return NextResponse.json(result);
}















