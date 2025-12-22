// Block 40210 — Insurance Documentation API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { storm_lead_id } = await req.json();

    if (!storm_lead_id) {
      return NextResponse.json(
        { error: "storm_lead_id is required" },
        { status: 400 }
      );
    }

    // Call database function to prepare insurance docs
    const { data: docs, error: docsError } = await supabase.rpc(
      "prepare_insurance_docs",
      {
        p_storm_lead_id: storm_lead_id,
      }
    );

    if (docsError) {
      throw docsError;
    }

    return NextResponse.json({
      ok: true,
      docs,
    });
  } catch (error: any) {
    console.error("Error in POST /api/storm/insurance-docs:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































