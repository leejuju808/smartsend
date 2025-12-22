import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface BuildSplitRequest {
  name: string;
  seed?: number;
  train?: number;
  val?: number;
  test?: number;
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Missing Supabase configuration" }, { status: 500 });
  }

  const body = (await req.json()) as BuildSplitRequest;
  const { name, seed, train = 0.8, val = 0.1, test = 0.1 } = body || {};

  if (!name) {
    return NextResponse.json({ ok: false, error: "Split name is required" }, { status: 400 });
  }

  const s = createClient(url, serviceKey);
  const { data, error } = await s.rpc('build_stratified_split', {
    p_name: name,
    p_seed: seed,
    p_train: train,
    p_val: val,
    p_test: test,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, split_id: data ?? null });
}
