import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    // Query the growth_funnel view
    const { data, error } = await supabase
      .from("growth_funnel")
      .select("*")
      .order("signup_date", { ascending: false })
      .limit(90);

    if (error) {
      console.error("Error fetching growth funnel:", error);
      return NextResponse.json(
        { error: "Failed to fetch funnel data", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("Error in growth funnel API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

