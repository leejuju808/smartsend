import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Get org_id from query params
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    
    if (!orgId) {
      return NextResponse.json(
        { error: "org_id parameter is required" },
        { status: 400 }
      );
    }

    // Get revenue data for the organization
    const { data: revenueData, error } = await supabase
      .from("org_revenue")
      .select("*")
      .eq("org_id", orgId)
      .order("last_sync", { ascending: true });

    if (error) {
      console.error("Error fetching revenue data:", error);
      return NextResponse.json(
        { error: "Failed to fetch revenue data" },
        { status: 500 }
      );
    }

    // If no revenue data exists, create a default record
    if (!revenueData || revenueData.length === 0) {
      const { data: defaultRevenue, error: insertError } = await supabase
        .from("org_revenue")
        .insert({
          org_id: orgId,
          mrr: 0,
          arr: 0,
          churn_rate: 0,
          last_sync: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating default revenue record:", insertError);
        return NextResponse.json(
          { error: "Failed to initialize revenue data" },
          { status: 500 }
        );
      }

      return NextResponse.json([defaultRevenue]);
    }

    return NextResponse.json(revenueData);

  } catch (error) {
    console.error("Org revenue API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 