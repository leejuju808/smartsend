// POST /api/company/users/accept
// Accept a company invitation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { invite_token } = body;

    if (!invite_token) {
      return NextResponse.json(
        { error: "invite_token is required" },
        { status: 400 }
      );
    }

    // Find the invitation
    const { data: member, error: memberError } = await supabase
      .from("roofing_company_members")
      .select("*")
      .eq("invite_token", invite_token)
      .eq("user_id", user.id)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 400 }
      );
    }

    // Check if already accepted
    if (member.is_active && member.accepted_at) {
      return NextResponse.json(
        { error: "Invitation already accepted" },
        { status: 400 }
      );
    }

    // Check if expired
    if (member.invite_expires_at && new Date(member.invite_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 400 }
      );
    }

    // Accept the invitation
    const { data: updatedMember, error: updateError } = await supabase
      .from("roofing_company_members")
      .update({
        is_active: true,
        accepted_at: new Date().toISOString(),
        invite_token: null, // Clear token after acceptance
        invite_expires_at: null,
      })
      .eq("id", member.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error accepting invitation:", updateError);
      return NextResponse.json(
        { error: "Failed to accept invitation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      member: updatedMember,
      roofing_company_id: member.roofing_company_id,
    });
  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























