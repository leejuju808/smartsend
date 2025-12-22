import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("sequences")
      .select("id, name, status")
      .eq("owner", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }

    return NextResponse.json({ sequences: data ?? [] });
  } catch (error) {
    console.error("Error fetching sequences:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}