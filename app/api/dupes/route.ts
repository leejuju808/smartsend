import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsedLimit = Number(searchParams.get("limit") ?? 100);
  const parsedOffset = Number(searchParams.get("offset") ?? 0);

  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 100;
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  const supabase = createClient();
  await setAccountContext(supabase);
  const { data: rows, error } = await supabase
    .from("lead_dupe_candidates")
    .select("id, lead_a, lead_b, reason, name_sim, company_sim, email_exact, created_at")
    .order("email_exact", { ascending: false })
    .order("name_sim", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const ids = Array.from(
    new Set((rows ?? []).flatMap((row) => [row.lead_a, row.lead_b]).filter(Boolean))
  );

  let leads: any[] = [];
  if (ids.length) {
    const { data } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, company, title, phone, domain_norm")
      .in("id", ids);
    leads = data ?? [];
  }

  return NextResponse.json({ rows: rows ?? [], leads });
}

