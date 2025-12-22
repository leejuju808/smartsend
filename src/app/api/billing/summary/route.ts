import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const user = url.searchParams.get("user");
  
  if (!user) {
    return NextResponse.json({ error: "user parameter required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: ba, error: baError } = await supabase
    .from("billing_accounts")
    .select("*, plan:billing_plans(name)")
    .eq("user_id", user)
    .maybeSingle();

  if (baError) {
    console.error("Error fetching billing account:", baError);
  }

  const { data: usage, error: usageError } = await supabase
    .from("v_billing_summary")
    .select("*")
    .eq("user_id", user)
    .maybeSingle();

  if (usageError) {
    console.error("Error fetching usage summary:", usageError);
  }

  return NextResponse.json({
    summary: {
      stripe_customer_id: ba?.stripe_customer_id,
      plan_name: usage?.plan_name ?? ba?.plan?.name ?? "—",
      status: usage?.status ?? ba?.status ?? "—",
      period_end: usage?.period_end ?? ba?.period_end ?? null,
      usage_soft_cap: usage?.usage_soft_cap ?? ba?.usage_soft_cap ?? 0,
      emails_sent_today: usage?.emails_sent_today ?? 0,
    }
  }, { headers: { "content-type": "application/json" } });
}
