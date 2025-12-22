// Block 200000 — SmartSend Roofing Homeowner Portal Creation API
// POST /api/portal/create
// Creates a homeowner portal for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const {
      jobId,
      homeownerName,
      homeownerLastName,
      homeownerEmail,
      homeownerPhone,
    } = await req.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    // Create portal via database function
    const { data: portalId, error } = await supabase.rpc("create_homeowner_portal", {
      p_job_id: jobId,
      p_homeowner_name: homeownerName,
      p_homeowner_last_name: homeownerLastName,
      p_homeowner_email: homeownerEmail,
      p_homeowner_phone: homeownerPhone,
    });

    if (error) {
      console.error("Portal creation error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create portal" },
        { status: 500 }
      );
    }

    // Get portal details
    const { data: portal, error: fetchError } = await supabase
      .from("homeowner_portals")
      .select("*")
      .eq("id", portalId)
      .single();

    if (fetchError || !portal) {
      return NextResponse.json(
        { error: "Failed to fetch portal details" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      portal: {
        id: portal.id,
        portalCode: portal.portal_code,
        portalUrl: portal.portal_url,
        pinCode: portal.pin_code,
      },
    });
  } catch (error: any) {
    console.error("Portal creation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























