// Block 253900 — SmartSend Customer Experience Engine v1
// POST /api/homeowner/service-request
// Create service request from homeowner

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
      request_type,
      description,
      photo_url,
      priority = "normal",
    } = body;

    if (!portal_key || !request_type || !description) {
      return NextResponse.json(
        { error: "Portal key, request type, and description are required" },
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

    // Create service request
    const { data: serviceRequest, error: requestError } = await supabase
      .from("service_requests")
      .insert({
        job_id: homeownerAccount.job_id,
        homeowner_id: homeownerAccount.id,
        request_type,
        description,
        photo_url: photo_url || null,
        priority,
        status: "open",
      })
      .select()
      .single();

    if (requestError) {
      console.error("Error creating service request:", requestError);
      return NextResponse.json(
        { error: "Failed to create service request" },
        { status: 500 }
      );
    }

    // TODO: Notify PM about new service request
    // This would integrate with notification system

    return NextResponse.json({
      ok: true,
      serviceRequest,
    });
  } catch (error: any) {
    console.error("Error in service request API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























