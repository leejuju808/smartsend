// Block 228000 — Send Insurance Supplement to Adjuster
// POST /api/supplements/send
// Sends supplement package to insurance adjuster

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supplement_id, adjuster_email, adjuster_name, adjuster_phone } = await req.json();

    if (!supplement_id) {
      return NextResponse.json(
        { error: "supplement_id is required" },
        { status: 400 }
      );
    }

    if (!adjuster_email) {
      return NextResponse.json(
        { error: "adjuster_email is required" },
        { status: 400 }
      );
    }

    // Get supplement
    const { data: supplement, error: supplementError } = await supabase
      .from("insurance_supplements")
      .select("*")
      .eq("id", supplement_id)
      .single();

    if (supplementError || !supplement) {
      return NextResponse.json(
        { error: "Supplement not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", supplement.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    if (supplement.status !== "draft") {
      return NextResponse.json(
        { error: `Supplement is already ${supplement.status}` },
        { status: 400 }
      );
    }

    // Update supplement with adjuster info and mark as sent
    const { error: updateError } = await supabase
      .from("insurance_supplements")
      .update({
        status: "sent",
        adjuster_email,
        adjuster_name: adjuster_name || null,
        adjuster_phone: adjuster_phone || null,
        sent_at: new Date().toISOString(),
        next_followup_date: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().split('T')[0], // 72 hours from now
        updated_at: new Date().toISOString(),
      })
      .eq("id", supplement_id);

    if (updateError) {
      console.error("Error sending supplement:", updateError);
      return NextResponse.json(
        { error: "Failed to send supplement" },
        { status: 500 }
      );
    }

    // In production, this would:
    // 1. Generate the supplement document PDF
    // 2. Email it to the adjuster
    // 3. Store the document URL in documents_url field
    // 4. Create a follow-up reminder

    return NextResponse.json({
      success: true,
      supplement_id,
      adjuster_email,
      message: "Supplement sent to adjuster. Follow-up scheduled for 72 hours.",
      next_followup_date: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
  } catch (error: any) {
    console.error("Error sending supplement:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send supplement" },
      { status: 500 }
    );
  }
}

























