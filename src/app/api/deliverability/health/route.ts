import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const [w7, w30] = await Promise.all([
    supabase.from("v_bounce_rate_7d").select("*").eq("workspace_id", u.user.id).order("bounce_pct", { ascending:false }),
    supabase.from("v_bounce_rate_30d").select("*").eq("workspace_id", u.user.id).order("bounce_pct", { ascending:false })
  ]);

  if (w7.error || w30.error) {
    return NextResponse.json({ ok:false, error: w7.error?.message || w30.error?.message }, { status:500 });
  }

  // Simple thresholds
  const THRESH_WARN = 2.0;   // %
  const THRESH_FAIL = 5.0;   // %
  const top7 = (w7.data ?? [])[0];
  const flag = top7 ? (top7.bounce_pct >= THRESH_FAIL ? "fail" : top7.bounce_pct >= THRESH_WARN ? "warn" : "ok") : "ok";

  return NextResponse.json({
    ok:true,
    last7d: w7.data ?? [],
    last30d: w30.data ?? [],
    threshold: { warn: THRESH_WARN, fail: THRESH_FAIL },
    status: flag
  });
}