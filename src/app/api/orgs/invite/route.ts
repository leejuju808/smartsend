import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { sign } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin of the org
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Create a short-lived token (valid for 7 days)
    const token = sign({
      orgId,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
    });

    return NextResponse.json({
      inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/join?token=${token}`,
      token,
    });
  } catch (error) {
    console.error("Error creating invite:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

