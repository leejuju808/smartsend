import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireRole(["owner", "admin", "member"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { smartlistId, autoRefresh } = body;

  // Validate campaign exists and user has access
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, account_id")
    .eq("id", params.id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "campaign_not_found" },
      { status: 404 }
    );
  }

  // If smartlistId is provided, validate it exists and is a SmartList
  if (smartlistId) {
    const { data: smartlist, error: slError } = await supabase
      .from("shared_resources")
      .select("id, smart")
      .eq("id", smartlistId)
      .eq("smart", true)
      .single();

    if (slError || !smartlist) {
      return NextResponse.json(
        { error: "smartlist_not_found" },
        { status: 404 }
      );
    }
  }

  // Update campaign with SmartList attachment
  const { error: updateError } = await supabase
    .from("campaigns")
    .update({
      smartlist_id: smartlistId || null,
      auto_refresh: autoRefresh !== undefined ? autoRefresh : true,
    })
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json(
      { error: "update_failed", details: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}












