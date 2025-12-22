import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verify } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Verify token
    const payload = verify<{ orgId: string }>(token);
    if (!payload || !payload.orgId) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if already a member
    const { data: existing } = await supabaseAdmin
      .from("org_members")
      .select("org_id")
      .eq("org_id", payload.orgId)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Already a member" }, { status: 400 });
    }

    // Insert membership using admin client to bypass RLS
    const { error: insertError } = await supabaseAdmin
      .from("org_members")
      .insert({
        org_id: payload.orgId,
        user_id: user.id,
        role: "member",
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error joining org:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

