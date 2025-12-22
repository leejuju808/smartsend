/**
 * Block 19500 — SmartSend Lead Verification Engine v1
 * POST /api/lead/verify/check-email
 * Check email quality only
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyEmail } from "@/lib/lead-verification/verification-workers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    const result = await verifyEmail({ email });

    return NextResponse.json({
      result,
      score: result.score,
      status: result.status,
    });
  } catch (error: any) {
    console.error("Error checking email:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check email" },
      { status: 500 }
    );
  }
}





















































