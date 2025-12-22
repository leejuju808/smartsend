import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = supabaseAdmin();

  const [{ data: leadScore, error: leadScoreError }, { data: histogram, error: histError }] =
    await Promise.all([
      supabase.from("lead_scores").select("*").eq("lead_id", params.id).maybeSingle(),
      supabase
        .from("send_time_histograms")
        .select("hour, weight")
        .eq("scope", "lead")
        .eq("key", params.id)
        .order("hour", { ascending: true }),
    ]);

  if (leadScoreError) {
    console.error("Failed to fetch lead score", leadScoreError);
    return NextResponse.json(
      { error: "Unable to load engagement metrics." },
      { status: 500 }
    );
  }

  if (histError) {
    console.error("Failed to fetch histogram", histError);
  }

  const { data: nextBestTs, error: nextBestError } = await supabase.rpc(
    "next_best_send_ts",
    { p_lead: params.id }
  );

  if (nextBestError) {
    console.error("Failed to compute next best send time", nextBestError);
  }

  return NextResponse.json({
    score: leadScore?.score ?? leadScore?.engagement_score ?? 0,
    opens_30d: leadScore?.opens_30d ?? 0,
    clicks_30d: leadScore?.clicks_30d ?? 0,
    replies_30d: leadScore?.replies_30d ?? 0,
    bounces_30d: leadScore?.bounces_30d ?? 0,
    next_best_utc: nextBestTs ?? null,
    histogram: histogram ?? [],
  });
}








