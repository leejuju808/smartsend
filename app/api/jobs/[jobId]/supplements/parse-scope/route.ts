// Block 27640 — SmartSend Roofing Insurance Supplement Intelligence v1
// API Route: POST /api/jobs/[jobId]/supplements/parse-scope
// Parses insurance scope text and generates supplement recommendations

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const { scope_text } = await req.json();

    if (!scope_text) {
      return NextResponse.json(
        { error: "scope_text is required" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get Supabase URL and service role key for edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Call the parse_scope edge function
    const functionUrl = `${supabaseUrl}/functions/v1/parse_scope`;
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({
        job_id: jobId,
        scope_text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to parse scope");
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/jobs/[jobId]/supplements/parse-scope:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































