/**
 * POST /api/financing/followup
 * Trigger follow-up for financing denial
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processFinancingDenial } from "@/lib/financing/followup";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { applicationId } = body;

    if (!applicationId) {
      return NextResponse.json(
        { error: "applicationId is required" },
        { status: 400 }
      );
    }

    await processFinancingDenial(applicationId);

    return NextResponse.json({
      success: true,
      message: "Follow-up processed successfully",
    });
  } catch (error: any) {
    console.error("Error processing financing follow-up:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process follow-up" },
      { status: 500 }
    );
  }
}





















