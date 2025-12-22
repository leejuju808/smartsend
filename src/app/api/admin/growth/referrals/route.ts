import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    // Query the referral_dashboard view
    const { data, error } = await supabase
      .from("referral_dashboard")
      .select("*")
      .limit(50);

    if (error) {
      console.error("Error fetching referrals:", error);
      return NextResponse.json(
        { error: "Failed to fetch referrals", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("Error in referrals API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

