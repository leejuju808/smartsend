import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, workspace_id, scope_pdf_url, insurance_company, claim_number, adjuster_name, adjuster_email, adjuster_phone } = body;

    if (!job_id || !workspace_id || !scope_pdf_url) {
      return NextResponse.json(
        { error: "job_id, workspace_id, and scope_pdf_url required" },
        { status: 400 }
      );
    }

    // Call edge function
    const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/claim-upload-scope`;
    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        job_id,
        workspace_id,
        scope_pdf_url,
        insurance_company,
        claim_number,
        adjuster_name,
        adjuster_email,
        adjuster_phone,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to upload scope", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error uploading scope:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























