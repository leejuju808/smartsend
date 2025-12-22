// GET /api/me - Get current user profile data
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, company_name, email")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: profile?.name || user.user_metadata?.name || null,
      company_name: profile?.company_name || null,
    });
  } catch (error: any) {
    console.error("Error in GET /api/me:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
