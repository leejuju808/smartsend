// POST /api/workforce/qc/signoff - Create customer signoff

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { job_id, inspection_id, customer_name, signature_url } = body;

    if (!job_id || !customer_name || !signature_url) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, customer_name, signature_url" },
        { status: 400 }
      );
    }

    // Get IP and user agent from request
    const ipAddress = req.headers.get("x-forwarded-for") || 
                      req.headers.get("x-real-ip") || 
                      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    const { data, error } = await supabase
      .from("customer_signoff")
      .insert({
        job_id,
        inspection_id: inspection_id || null,
        customer_name,
        signature_url,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating customer signoff:", error);
      return NextResponse.json(
        { error: "Failed to create customer signoff" },
        { status: 500 }
      );
    }

    // Update inspection status if inspection_id provided
    if (inspection_id) {
      await supabase
        .from("qc_inspections")
        .update({ status: "pending_customer_signoff" })
        .eq("id", inspection_id);
    }

    return NextResponse.json({ signoff: data }, { status: 201 });
  } catch (error) {
    console.error("Error in customer signoff POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























