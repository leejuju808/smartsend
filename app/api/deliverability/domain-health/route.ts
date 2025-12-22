import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const FUNCTION_URL = SUPABASE_URL.replace(/\.supabase\.co/, ".functions.supabase.co");

export async function POST(req: NextRequest) {
  try {
    const { domain_settings_id } = await req.json();

    if (!domain_settings_id) {
      return NextResponse.json(
        { error: "domain_settings_id is required" },
        { status: 400 }
      );
    }

    // Call edge function
    const response = await fetch(`${FUNCTION_URL}/deliverability-domainHealth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        domain_settings_id,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || "Health calculation failed" },
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
