// app/api/campaigns/[campaignId]/leads/bulk/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type LeadRowInput = {
  email: string;
  name?: string;
  city?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  // Verify campaign exists and user has access
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, owner_id")
    .eq("id", params.campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Check if user owns the campaign
  if (campaign.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Not authorized to add leads to this campaign" },
      { status: 403 }
    );
  }

  let payload: { rows?: LeadRowInput[] };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const rows = payload.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "No leads provided" },
      { status: 400 }
    );
  }

  // Basic email validation & cleaning
  const cleaned = rows
    .map((r) => ({
      email: (r.email || "").trim().toLowerCase(),
      name: r.name?.trim() || null,
      city: r.city?.trim() || null,
    }))
    .filter((r) => r.email && r.email.includes("@"));

  if (!cleaned.length) {
    return NextResponse.json(
      { error: "No valid email addresses found" },
      { status: 400 }
    );
  }

  const leadsToInsert = cleaned.map((r) => ({
    owner_id: user.id,
    campaign_id: params.campaignId,
    email: r.email,
    name: r.name,
    city: r.city,
    status: "new" as const, // Map 'open' to 'new' to match table schema
  }));

  const { data, error } = await supabase
    .from("leads")
    .insert(leadsToInsert)
    .select("id");

  if (error) {
    console.error("Bulk lead insert error:", error);
    return NextResponse.json(
      { error: "Failed to import leads", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      imported_count: data?.length ?? 0,
    },
    { status: 201 }
  );
}

























































