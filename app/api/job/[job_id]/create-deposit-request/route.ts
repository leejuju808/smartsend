// Block 27280 — SmartSend Roofing Deposit & Payment Request Engine v1
// API Route: POST /api/job/[job_id]/create-deposit-request
// 
// Triggers deposit request creation via Supabase edge function

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const { deposit_percentage } = await req.json();

    if (!job_id) {
      return NextResponse.json(
        { error: "Missing job_id" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json(
        { error: "Supabase URL not configured" },
        { status: 500 }
      );
    }

    const supabaseFunctionUrl = `${supabaseUrl}/functions/v1/create_deposit_request`;

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "Service role key not configured" },
        { status: 500 }
      );
    }

    const res = await fetch(supabaseFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ job_id, deposit_percentage }),
    });

    if (!res.ok) {
      const text = await res.text();
      let error;
      try {
        error = JSON.parse(text);
      } catch {
        error = { error: text };
      }
      return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error creating deposit request:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































