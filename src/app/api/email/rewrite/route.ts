import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Authenticate user
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { template } = await req.json();

    if (!template || typeof template !== "string") {
      return NextResponse.json(
        { error: "Template is required" },
        { status: 400 }
      );
    }

    // Prepare request to edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_SUPABASE_URL not configured" },
        { status: 500 }
      );
    }

    // Call the rewrite-email edge function
    const response = await fetch(`${supabaseUrl}/functions/v1/rewrite-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ template }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: "Failed to rewrite email",
      }));
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in email rewrite API:", error);
    return NextResponse.json(
      { error: error.message || "Failed to rewrite email" },
      { status: 500 }
    );
  }
}

