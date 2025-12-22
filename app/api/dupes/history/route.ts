import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function GET(req: NextRequest) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const supabase = createClient();
  await setAccountContext(supabase);

  const { data, error } = await supabase
    .from("lead_merge_audit")
    .select("id,created_at,primary_lead,secondary_lead,strategy")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const ids = Array.from(
    new Set((data ?? []).flatMap((row) => [row.primary_lead, row.secondary_lead]).filter(Boolean))
  );

  const { data: leads } = await supabase
    .from("leads")
    .select("id,email")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const emailById = new Map((leads ?? []).map((lead) => [lead.id, lead.email]));

  const rows =
    data?.map((row) => ({
      ...row,
      primary_email: emailById.get(row.primary_lead),
      secondary_email: emailById.get(row.secondary_lead),
    })) ?? [];

  return NextResponse.json({ rows });
}


