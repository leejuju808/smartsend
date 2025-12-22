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

    // Get user's company (assuming user is owner or has access)
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!company) {
      return NextResponse.json({ error: "No company found" }, { status: 404 });
    }

    // Query owner HQ command board view
    const { data: commandBoard, error } = await supabase
      .from("v_owner_hq_command_board")
      .select("*")
      .eq("company_id", company.id)
      .single();

    if (error) {
      console.error("Error fetching command board:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(commandBoard || {});
  } catch (error: any) {
    console.error("Error in command board API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}






















