// Block 57000 — API Route: GET /api/proposals/[id]/line-items
// Returns price line items for a proposal

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();

    // Get line items
    const { data: lineItems, error: lineItemsError } = await supabase
      .from("proposal_price_line_items")
      .select("*")
      .eq("proposal_id", id)
      .order("sort_order", { ascending: true });

    if (lineItemsError) {
      console.error("Error fetching line items:", lineItemsError);
      return NextResponse.json(
        { error: "Failed to fetch line items" },
        { status: 500 }
      );
    }

    return NextResponse.json({ line_items: lineItems || [] });
  } catch (error) {
    console.error("Error in /api/proposals/[id]/line-items:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































