// Block 28060 — SmartSend Roofing Review & Referral Engine v1
// API Route: Request Review
// Manually trigger review request for a homeowner

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { homeowner_id, lead_id, google_link } = body;

    if (!homeowner_id || !lead_id) {
      return NextResponse.json(
        { error: "homeowner_id and lead_id are required" },
        { status: 400 }
      );
    }

    // Get homeowner profile
    const { data: homeowner, error: homeownerError } = await supabase
      .from("homeowner_profiles")
      .select("*")
      .eq("id", homeowner_id)
      .single();

    if (homeownerError || !homeowner) {
      return NextResponse.json(
        { error: "Homeowner profile not found" },
        { status: 404 }
      );
    }

    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("email, phone, first_name, last_name")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Call edge function to send review request
    const serviceClient = createServiceClient();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-review-request`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          homeowner_id,
          lead_id,
          phone: lead.phone,
          email: lead.email,
          name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim(),
          google_link: google_link || process.env.GOOGLE_REVIEW_URL || "",
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to send review request" },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Error requesting review:", error);
    return NextResponse.json(
      { error: error.message || "Failed to request review" },
      { status: 500 }
    );
  }
}


































