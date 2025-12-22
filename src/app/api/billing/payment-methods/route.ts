// Block 240000 — SmartSend Roofing Billing & Payments Hub
// GET /api/billing/payment-methods
// List payment methods for a homeowner

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const homeownerId = searchParams.get("homeowner_id");
    const workspaceId = searchParams.get("workspace_id");

    if (!homeownerId && !workspaceId) {
      return NextResponse.json(
        { error: "Must provide homeowner_id or workspace_id" },
        { status: 400 }
      );
    }

    let query = supabase.from("payment_methods").select("*").order("is_default", { ascending: false });

    if (homeownerId) {
      query = query.eq("homeowner_id", homeownerId);
    }

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data: paymentMethods, error } = await query;

    if (error) {
      console.error("Error fetching payment methods:", error);
      return NextResponse.json(
        { error: "Failed to fetch payment methods", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      payment_methods: paymentMethods || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/billing/payment-methods:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























