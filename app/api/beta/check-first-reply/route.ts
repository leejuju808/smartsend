// Block 10100 — Check First Reply Automation
// POST /api/beta/check-first-reply
// Called when a reply is detected to check if it's the beta tester's first homeowner reply
// and trigger conversion offer if eligible

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = createSupabaseServer();
    const body = await req.json();
    const { workspace_id, reply_id, is_auto_reply = false } = body;

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Skip auto-replies
    if (is_auto_reply) {
      return NextResponse.json({
        success: true,
        message: "Skipped auto-reply",
      });
    }

    // Find beta tester for this workspace
    const { data: betaTester, error: betaError } = await supabaseAdmin
      .from("beta_testers")
      .select("*")
      .eq("workspace_id", workspace_id)
      .is("first_homeowner_reply_at", null) // Only if they haven't received first reply yet
      .single();

    if (betaError || !betaTester) {
      // No beta tester found or already has first reply
      return NextResponse.json({
        success: true,
        message: "No beta tester found or already has first reply",
      });
    }

    // Update beta tester with first homeowner reply timestamp
    const { error: updateError } = await supabaseAdmin
      .from("beta_testers")
      .update({
        first_homeowner_reply_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", betaTester.id);

    if (updateError) {
      console.error("Error updating beta tester:", updateError);
      return NextResponse.json(
        { error: "Failed to update beta tester", details: updateError },
        { status: 500 }
      );
    }

    // Automatically send conversion offer (after a short delay to let them see the reply)
    // In production, you might want to queue this or send it via email
    try {
      // Call conversion offer endpoint
      const conversionResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/beta/conversion-offer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            beta_tester_id: betaTester.id,
            send_via: "in_app", // Will show in dashboard
          }),
        }
      );

      if (!conversionResponse.ok) {
        console.error(
          "Failed to send conversion offer:",
          await conversionResponse.text()
        );
        // Don't fail the request, first reply is still tracked
      }
    } catch (offerErr) {
      console.error("Error sending conversion offer:", offerErr);
      // Don't fail the request
    }

    return NextResponse.json({
      success: true,
      message: "First homeowner reply tracked and conversion offer triggered",
      beta_tester_id: betaTester.id,
    });
  } catch (error: any) {
    console.error("Error in POST /api/beta/check-first-reply:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























































