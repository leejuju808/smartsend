import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";

const Body = z.object({
  savedViewId: z.string().uuid(),
  limit: z.number().int().min(1).max(5000).default(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createClient();
  const payload = Body.parse(await req.json());

  const { savedViewId, limit } = payload;

  const { data, error } = await supabase.rpc("apply_saved_view_compiled", {
    p_saved_view_id: savedViewId,
    p_limit: limit,
    p_offset: 0,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const leadIds = (data ?? [])
    .map((row: any) => row.lead_id)
    .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

  if (leadIds.length === 0) {
    return NextResponse.json({ added: 0 });
  }

  const rowsToInsert = leadIds.map((leadId) => ({
    campaign_id: params.campaignId,
    lead_id: leadId,
  }));

  const { error: insertError, count } = await supabase
    .from("campaign_leads")
    .insert(rowsToInsert, { count: "estimated" });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ added: count ?? rowsToInsert.length });
}


