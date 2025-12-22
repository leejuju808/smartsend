import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { setAccountContext } from "@/app/api/_utils/account";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const accountId = await setAccountContext(supabase);

  if (!accountId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: items, error } = await supabase
    .from("merge_queue")
    .select(
      `
      id,
      created_at,
      reason,
      status,
      lead_a,
      lead_b
    `
    )
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch lead details separately
  const leadIds = new Set<string>();
  items?.forEach((item) => {
    if (item.lead_a) leadIds.add(item.lead_a);
    if (item.lead_b) leadIds.add(item.lead_b);
  });

  if (leadIds.size === 0) {
    return NextResponse.json({ items: [] });
  }

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, email, first_name, last_name, company, phone, status")
    .in("id", Array.from(leadIds))
    .eq("account_id", accountId);

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const leadsMap = new Map(leads?.map((l) => [l.id, l]) || []);

  const itemsWithLeads = items?.map((item) => ({
    ...item,
    lead_a: leadsMap.get(item.lead_a) || null,
    lead_b: leadsMap.get(item.lead_b) || null,
  }));

  return NextResponse.json({ items: itemsWithLeads || [] });
}

