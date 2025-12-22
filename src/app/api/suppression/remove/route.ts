import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get user
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Remove from suppressions table
    const { error: deleteError } = await supabase
      .from("suppressions")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", "email")
      .eq("value_lower", normalizedEmail);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true, email: normalizedEmail });

  } catch (error: any) {
    console.error("Remove suppression error:", error);
    return NextResponse.json({ error: error.message || "Failed to remove suppression" }, { status: 500 });
  }
} 