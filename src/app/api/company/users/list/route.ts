// GET /api/company/users/list
// List all team members for a company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const roofing_company_id = searchParams.get("roofing_company_id");

    if (!roofing_company_id) {
      return NextResponse.json(
        { error: "roofing_company_id is required" },
        { status: 400 }
      );
    }

    // Check if user is a member
    const { data: currentMember } = await supabase
      .from("roofing_company_members")
      .select("role")
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!currentMember) {
      return NextResponse.json(
        { error: "You are not a member of this company" },
        { status: 403 }
      );
    }

    // Get all members
    const { data: members, error: membersError } = await supabase
      .from("roofing_company_members")
      .select(`
        id,
        user_id,
        role,
        is_active,
        invited_by,
        accepted_at,
        last_login_at,
        created_at,
        updated_at,
        profiles:user_id (
          id,
          email
        )
      `)
      .eq("roofing_company_id", roofing_company_id)
      .order("created_at", { ascending: false });

    if (membersError) {
      console.error("Error fetching members:", membersError);
      return NextResponse.json(
        { error: "Failed to fetch team members" },
        { status: 500 }
      );
    }

    // Format response
    const formattedMembers = (members || []).map((member: any) => ({
      id: member.id,
      user_id: member.user_id,
      email: member.profiles?.email || null,
      role: member.role,
      is_active: member.is_active,
      invited_by: member.invited_by,
      accepted_at: member.accepted_at,
      last_login_at: member.last_login_at,
      created_at: member.created_at,
    }));

    return NextResponse.json({
      success: true,
      members: formattedMembers,
    });
  } catch (error: any) {
    console.error("Error listing team members:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























