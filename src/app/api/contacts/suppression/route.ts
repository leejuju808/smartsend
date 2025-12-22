import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get user
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Fetch suppressions for the user
    const { data: suppressions, error: fetchError } = await supabase
      .from("suppressions")
      .select("*")
      .eq("user_id", user.id)
      .eq("kind", "email")
      .order("created_at", { ascending: false });

    if (fetchError) {
      throw fetchError;
    }

    return NextResponse.json({ rows: suppressions || [] });

  } catch (error: any) {
    console.error("Fetch suppressions error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch suppressions" }, { status: 500 });
  }
}

 