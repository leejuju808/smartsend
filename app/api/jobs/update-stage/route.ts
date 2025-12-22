import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { job_id, stage, lead_id } = await req.json();

    if (!job_id || !stage) {
      return NextResponse.json(
        { error: "Missing job_id or stage" },
        { status: 400 }
      );
    }

    // Call the edge function to send customer notifications
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/send-job-update`;
    
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        job_id,
        stage,
        lead_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in update-stage route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































