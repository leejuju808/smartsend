// app/api/campaigns/[id]/booking-link/route.ts
// Block 21716 — Booking Link Update API
// Allows updating the booking_link_url for a campaign during onboarding

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaignId = params.id;
  const body = await req.json();
  const bookingLink = (body.booking_link_url as string | undefined) ?? null;

  try {
    // Verify campaign exists and user has access
    const {
      data: campaign,
      error: campaignError,
    } = await supabase
      .from("campaigns")
      .select("id, company_id, workspace_id, org_id, user_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Update booking link
    const { data, error } = await supabase
      .from("campaigns")
      .update({ booking_link_url: bookingLink })
      .eq("id", campaignId)
      .select("id, booking_link_url")
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to update booking link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}











































