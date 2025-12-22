// Block 253900 — SmartSend Customer Experience Engine v1
// POST /api/homeowner/warranty-claim
// Create warranty claim from homeowner

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      portal_key,
      claim_description,
      photo_url,
      issue_started_date,
    } = body;

    if (!portal_key || !claim_description) {
      return NextResponse.json(
        { error: "Portal key and claim description are required" },
        { status: 400 }
      );
    }

    // Validate portal key and get homeowner account
    const { data: homeownerAccount, error: accountError } = await supabase
      .from("homeowner_accounts")
      .select("*")
      .eq("portal_key", portal_key)
      .eq("is_active", true)
      .single();

    if (accountError || !homeownerAccount) {
      return NextResponse.json(
        { error: "Invalid portal key" },
        { status: 401 }
      );
    }

    // Create warranty claim
    const { data: warrantyClaim, error: claimError } = await supabase
      .from("warranty_claims")
      .insert({
        job_id: homeownerAccount.job_id,
        homeowner_id: homeownerAccount.id,
        claim_description,
        photo_url: photo_url || null,
        issue_started_date: issue_started_date || null,
        status: "submitted",
      })
      .select()
      .single();

    if (claimError) {
      console.error("Error creating warranty claim:", claimError);
      return NextResponse.json(
        { error: "Failed to create warranty claim" },
        { status: 500 }
      );
    }

    // TODO: Notify PM about new warranty claim
    // This would integrate with notification system

    return NextResponse.json({
      ok: true,
      warrantyClaim,
    });
  } catch (error: any) {
    console.error("Error in warranty claim API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























