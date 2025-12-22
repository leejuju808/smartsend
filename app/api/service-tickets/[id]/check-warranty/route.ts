// Block 92000 — SmartSend Roofing Warranty Coverage Checker API v1

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST: Check warranty coverage for a service ticket
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { issue_category } = body;

    // Get ticket to find issue category if not provided
    const { data: ticket } = await supabase
      .from("service_tickets")
      .select("issue_category")
      .eq("id", id)
      .single();

    const categoryToCheck = issue_category || ticket?.issue_category;

    if (!categoryToCheck) {
      return NextResponse.json(
        { error: "Issue category is required" },
        { status: 400 }
      );
    }

    // Call the warranty coverage checker function
    const { data: coverageResult, error } = await supabase.rpc(
      "check_warranty_coverage",
      {
        p_ticket_id: id,
        p_issue_category: categoryToCheck,
      }
    );

    if (error) {
      console.error("Error checking warranty coverage:", error);
      return NextResponse.json(
        { error: error.message || "Failed to check warranty coverage" },
        { status: 500 }
      );
    }

    // Fetch updated ticket
    const { data: updatedTicket } = await supabase
      .from("service_tickets")
      .select(`
        *,
        warranty:warranties(
          id,
          warranty_type,
          end_date
        )
      `)
      .eq("id", id)
      .single();

    return NextResponse.json(
      {
        coverage: coverageResult,
        ticket: updatedTicket,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/service-tickets/[id]/check-warranty:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























