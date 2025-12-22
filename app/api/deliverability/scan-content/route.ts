import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const FUNCTION_URL = SUPABASE_URL.replace(/\.supabase\.co/, ".functions.supabase.co");

export async function POST(req: NextRequest) {
  try {
    const { org_id, campaign_id, subject_line, email_body } = await req.json();

    if (!org_id || !subject_line || !email_body) {
      return NextResponse.json(
        { error: "org_id, subject_line, and email_body are required" },
        { status: 400 }
      );
    }

    // Call edge function
    const response = await fetch(`${FUNCTION_URL}/deliverability-scanContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        org_id,
        campaign_id: campaign_id || null,
        subject_line,
        email_body,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || "Content scan failed" },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































