// Block 92000 — SmartSend Roofing Service Tickets v1
// API Route to check warranty coverage for a service ticket

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const supabase = createClient();
    const { ticketId } = await params;

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

    if (!issue_category) {
      return NextResponse.json(
        { error: "issue_category is required" },
        { status: 400 }
      );
    }

    // Call the warranty coverage checker function
    const { data: coverageResult, error } = await supabase.rpc(
      "check_warranty_coverage",
      {
        p_ticket_id: ticketId,
        p_issue_category: issue_category,
      }
    );

    if (error) {
      console.error("Error checking warranty coverage:", error);
      return NextResponse.json(
        { error: error.message || "Failed to check warranty coverage" },
        { status: 500 }
      );
    }

    return NextResponse.json({ coverage: coverageResult }, { status: 200 });
  } catch (error: any) {
    console.error("Error in POST /api/service-tickets/[ticketId]/check-coverage:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
