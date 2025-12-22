// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// API Route: Get financing status for lead/job

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = params;
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "lead"; // "lead" or "job"

    let statusData;

    if (type === "lead") {
      // Get financing status for lead
      const { data, error } = await supabase.rpc("get_lead_financing_status", {
        p_lead_id: id,
      });

      if (error) {
        console.error("Error getting lead financing status:", error);
        return NextResponse.json(
          { error: "Failed to get financing status" },
          { status: 500 }
        );
      }

      statusData = data;
    } else if (type === "job") {
      // Get financing status for job
      const { data, error } = await supabase.rpc("get_job_financing_status", {
        p_job_id: id,
      });

      if (error) {
        console.error("Error getting job financing status:", error);
        return NextResponse.json(
          { error: "Failed to get financing status" },
          { status: 500 }
        );
      }

      statusData = data;
    } else {
      return NextResponse.json(
        { error: "Invalid type. Must be 'lead' or 'job'" },
        { status: 400 }
      );
    }

    return NextResponse.json(statusData);
  } catch (error: any) {
    console.error("Error getting financing status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

































