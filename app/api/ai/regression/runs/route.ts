import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await s
    .from("ai_regression_runs")
    .select("id, created_at, bundle_id, challenger_version_tag, baseline_version_tag, passed, summary")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const bundleIds = [...new Set((data ?? []).map((d) => d.bundle_id))];
  let bundleNameMap = new Map<string, string>();

  if (bundleIds.length) {
    const { data: bundles, error: bundleErr } = await s
      .from("ai_regression_bundles")
      .select("id, name")
      .in("id", bundleIds);

    if (bundleErr) {
      return NextResponse.json({ ok: false, error: bundleErr.message }, { status: 500 });
    }

    bundleNameMap = new Map((bundles ?? []).map((b) => [b.id, b.name]));
  }

  const out = (data ?? []).map((d) => ({
    ...d,
    bundle_name: bundleNameMap.get(d.bundle_id) ?? d.bundle_id,
  }));

  return NextResponse.json({ ok: true, data: out });
}
















