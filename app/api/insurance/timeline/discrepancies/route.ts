// Block 21050 — Insurance Timeline Engine v2 — Discrepancy Detection API
// GET /api/insurance/timeline/discrepancies?thread_id=xxx&contact_id=xxx
// Returns unresolved discrepancies for a claim

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const searchParams = req.nextUrl.searchParams;
    const threadId = searchParams.get("thread_id");
    const contactId = searchParams.get("contact_id");
    const leadId = searchParams.get("lead_id");
    const includeResolved = searchParams.get("include_resolved") === "true";

    if (!threadId && !contactId && !leadId) {
      return NextResponse.json(
        { error: "thread_id, contact_id, or lead_id is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("insurance_timeline_discrepancies")
      .select("*");

    if (threadId) {
      query = query.eq("thread_id", threadId);
    } else if (contactId) {
      query = query.eq("contact_id", contactId);
    } else if (leadId) {
      query = query.eq("lead_id", leadId);
    }

    if (!includeResolved) {
      query = query.eq("is_resolved", false);
    }

    const { data: discrepancies, error } = await query
      .order("detected_at", { ascending: false });

    if (error) {
      console.error("Discrepancy query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch discrepancies", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ discrepancies: discrepancies || [] });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST /api/insurance/timeline/discrepancies - Mark discrepancy as resolved
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { discrepancy_id, resolution_notes } = await req.json();

    if (!discrepancy_id) {
      return NextResponse.json(
        { error: "discrepancy_id is required" },
        { status: 400 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("insurance_timeline_discrepancies")
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        resolution_notes,
      })
      .eq("id", discrepancy_id)
      .select()
      .single();

    if (error) {
      console.error("Discrepancy resolution error:", error);
      return NextResponse.json(
        { error: "Failed to resolve discrepancy", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ discrepancy: data });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
















































