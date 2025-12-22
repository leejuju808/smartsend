// Block 27640 — SmartSend Roofing Insurance Supplement Intelligence v1
// API Route: POST /api/jobs/[jobId]/supplements/generate-packet
// Generates a professional supplement packet document

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
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

    // Call the generate_supplement_packet edge function
    const functionUrl = `${supabaseUrl}/functions/v1/generate_supplement_packet`;
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({
        job_id: jobId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to generate supplement packet");
    }

    const data = await response.json();

    // Optionally save the HTML as a document in job_documents
    if (data.html) {
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("workspace_id")
        .eq("id", jobId)
        .single();

      if (job?.workspace_id) {
        await supabase.from("job_documents").insert({
          job_id: jobId,
          workspace_id: job.workspace_id,
          title: "Supplement Packet",
          doc_type: "insurance",
          category_folder: "insurance",
          html_content: data.html,
          uploaded_at: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/jobs/[jobId]/supplements/generate-packet:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































