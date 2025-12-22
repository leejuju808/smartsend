import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  // Get verification counts grouped by status
  const { data, error } = await supabase
    .from("lead_verifications")
    .select("lead_id, status")
    .eq("campaign_id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts = {
    valid: 0,
    risky: 0,
    invalid: 0,
    unknown: 0,
  };

  for (const row of data || []) {
    const status = row.status as keyof typeof counts;
    if (status in counts) {
      counts[status]++;
    }
  }

  // Also count unverified leads (not in lead_verifications)
  const { data: campaignLeads } = await supabase
    .from("campaign_leads")
    .select("id")
    .eq("campaign_id", params.id);

  const verifiedLeadIds = new Set((data || []).map((v: any) => v.lead_id));
  const totalLeads = campaignLeads?.length || 0;
  const verifiedCount = verifiedLeadIds.size;
  counts.unknown = Math.max(0, totalLeads - verifiedCount);

  return NextResponse.json({ counts });
}

