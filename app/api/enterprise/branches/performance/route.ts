import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query branch performance comparison view
    const { data: branches, error } = await supabase
      .from("v_branch_performance_comparison")
      .select("*")
      .order("total_revenue", { ascending: false });

    if (error) {
      console.error("Error fetching branch performance:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ branches: branches || [] });
  } catch (error: any) {
    console.error("Error in branch performance API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}






















