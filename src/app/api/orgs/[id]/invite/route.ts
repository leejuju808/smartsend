import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole, audit } from "@/lib/rbac";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check RBAC permissions
    const check = await requireRole(["invite"]);
    if (!check.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const org = check.org!;

    const { email, role = "member" } = await req.json();
    
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Check seat limit
    const { data: orgData } = await supabase
      .from("orgs")
      .select("seat_limit")
      .eq("id", org.id)
      .single();

    if (!orgData) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Count current members
    const { count } = await supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id);

    if ((count || 0) >= (orgData.seat_limit || 1)) {
      return NextResponse.json(
        { error: "Seat limit reached" },
        { status: 402 }
      );
    }

    // Look up user profile
    const { data: user } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from("org_members")
      .select("id")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 400 }
      );
    }

    // Add user to organization
    const { error: memberError } = await supabase
      .from("org_members")
      .insert({ org_id: org.id, user_id: user.id, role });

    if (memberError) {
      return NextResponse.json(
        { error: memberError.message },
        { status: 400 }
      );
    }

    // Update user's profile with org_id
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ org_id: org.id })
      .eq("id", user.id);

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 }
      );
    }

    // Audit log
    await audit("member.invite", { type: "member", id: user.id }, { email, role });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 