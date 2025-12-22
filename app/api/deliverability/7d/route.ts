import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: agg, error } = await supabase
    .from("v_deliverability_7d")
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: Array<Record<string, unknown>> = [];

  for (const row of agg ?? []) {
    const { data: acct } = await supabase
      .from("mail_accounts")
      .select("id,email,provider")
      .eq("id", row.account_id)
      .maybeSingle();

    rows.push({
      ...row,
      email: acct?.email ?? "-",
      provider: acct?.provider ?? "-",
    });
  }

  return NextResponse.json(rows);
}


