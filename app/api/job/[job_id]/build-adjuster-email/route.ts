import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

// POST /api/job/[job_id]/build-adjuster-email
// Calls edge function to generate adjuster email using AI + template
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const body = await req.json();
    const { playbook_id, adjuster_name } = body;

    if (!playbook_id) {
      return NextResponse.json(
        { error: "Missing required field: playbook_id" },
        { status: 400 }
      );
    }

    // Get Supabase URL and service role key for edge function call
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Call the edge function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/build-adjuster-email`;
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({
        job_id,
        playbook_id,
        adjuster_name: adjuster_name || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate email" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in build-adjuster-email route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































