// Block 27760 — SmartSend Roofing Material Order Automation v1
// API Route: POST /api/job/[job_id]/generate-material-order
// 
// Generates a draft material order for a job using AI

import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const body = await req.json();
    const { supplier_id, waste_factor } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "Missing job_id" },
        { status: 400 }
      );
    }

    // Call the edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate_material_order`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceRoleKey}`
        },
        body: JSON.stringify({
          job_id,
          supplier_id: supplier_id || null,
          waste_factor: waste_factor || 0.1
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate material order" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/job/[job_id]/generate-material-order:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































