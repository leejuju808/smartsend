import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    // Query the founder_kpis view
    const { data, error } = await supabase
      .from("founder_kpis")
      .select("*")
      .single();

    if (error) {
      console.error("Error fetching founder KPIs:", error);
      return NextResponse.json(
        { error: "Failed to fetch KPIs", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || {});
  } catch (error: any) {
    console.error("Error in growth KPIs API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

