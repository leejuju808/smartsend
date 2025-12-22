import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { account_id } = await req.json();

    if (!account_id) {
      return NextResponse.json({ ok: false, error: "account_id is required" }, { status: 400 });
    }

    await supabase.rpc("qa.reset_account", { p_account: account_id });
    await supabase.rpc("qa.seed_scheduler_matrix", {
      p_account: account_id,
      p_counts: { gmail: 20, outlook: 20, yahoo: 6, other: 6 },
    });

    await supabase.rpc("qa.set_isp_caps", {
      p_account: account_id,
      p_caps: { gmail_hourly: 5, outlook_hourly: 4, yahoo_hourly: 2, other_hourly: 3 },
    });

    await supabase.rpc("qa.set_domain_rep", {
      p_account: account_id,
      p_domain: "acme.com",
      p_band: 3,
      p_rep: 0.8,
      p_hourly: 100,
      p_daily: 800,
      p_backoff_seconds: 0,
    });

    await supabase.rpc("qa.set_domain_rep", {
      p_account: account_id,
      p_domain: "contoso.com",
      p_band: 3,
      p_rep: 0.8,
      p_hourly: 100,
      p_daily: 800,
      p_backoff_seconds: 0,
    });

    await supabase.rpc("qa.set_domain_rep", {
      p_account: account_id,
      p_domain: "yahoo-test.com",
      p_band: 3,
      p_rep: 0.8,
      p_hourly: 100,
      p_daily: 800,
      p_backoff_seconds: 0,
    });

    const { data: caseA, error: probeError } = await supabase.rpc("qa.scheduler_probe_counts", {
      p_account: account_id,
    });
    if (probeError) throw probeError;

    return NextResponse.json({ ok: true, caseA });
  } catch (error: any) {
    console.error("qa scheduler harness error", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Failed to run scheduler harness" },
      { status: 500 }
    );
  }
}

