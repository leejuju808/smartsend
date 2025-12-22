import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const guidelineId = params.id;
    const body = await req.json();
    const userId = body.user_id; // Should come from auth in production

    // Get the guideline
    const { data: guideline, error: fetchError } = await supabase
      .from("rewrite_guidelines")
      .select("*")
      .eq("id", guidelineId)
      .single();

    if (fetchError || !guideline) {
      return NextResponse.json(
        { error: "Guideline not found" },
        { status: 404 }
      );
    }

    if (guideline.status !== "pending") {
      return NextResponse.json(
        { error: "Guideline is not pending approval" },
        { status: 400 }
      );
    }

    // Archive any existing active guidelines for the same tone
    await supabase
      .from("rewrite_guidelines")
      .update({ status: "archived" })
      .eq("tone", guideline.tone)
      .eq("status", "active");

    // Activate the new guideline
    const { data: updated, error: updateError } = await supabase
      .from("rewrite_guidelines")
      .update({
        status: "active",
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", guidelineId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Log to system_logs
    await supabase.from("system_logs").insert({
      category: "ai_rewrite_tuning",
      level: "info",
      context: {
        guideline_id: guidelineId,
        tone: guideline.tone,
        approved_by: userId,
      },
      message: `Rewrite guidelines approved for tone: ${guideline.tone}`,
    });

    return NextResponse.json({ ok: true, guideline: updated });
  } catch (error: any) {
    console.error("Error approving guideline:", error);
    return NextResponse.json(
      { error: error.message || "Failed to approve guideline" },
      { status: 500 }
    );
  }
}















