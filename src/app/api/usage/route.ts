import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

export async function GET(_req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (k: string) => cookieStore.get(k)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ month: 0, limit: 0, ratePerMin: 0 });

  // plan
  const planRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/plan/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: user.id })
  });
  const plan = await planRes.json();

  // usage
  const ym = new Date().toISOString().slice(0,7); // YYYY-MM
  const { data: row } = await supabase
    .from("usage_monthly")
    .select("sent_count")
    .eq("user_id", user.id)
    .eq("period_ym", ym)
    .maybeSingle();

  return NextResponse.json({
    month: row?.sent_count ?? 0,
    limit: plan?.monthly_limit ?? 0,
    ratePerMin: plan?.rate_per_min ?? 0
  });
}