import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const accountId = new URL(req.url).searchParams.get("account_id");
  if (!accountId) return NextResponse.json({ error: "account_id required" }, { status: 400 });

  const { data, error } = await supabase.rpc("account_today_cap", { p_account: accountId }).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ cap: data });
}
