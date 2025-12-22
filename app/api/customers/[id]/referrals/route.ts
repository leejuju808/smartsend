// Block 254400 — SmartSend Lifetime Value Engine v1
// API Route: Customer Referrals
// GET /api/customers/[id]/referrals - Get customer referrals
// POST /api/customers/[id]/referrals - Create referral

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer to verify access
    const { data: customer } = await supabase
      .from("customers")
      .select("team_id")
      .eq("id", params.id)
      .single();

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Verify user is team member
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", customer.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get referrals
    const { data: referrals, error } = await supabase
      .from("referrals")
      .select("*")
      .eq("customer_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching referrals:", error);
      return NextResponse.json(
        { error: "Failed to fetch referrals" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      referrals: referrals || [],
    });
  } catch (error: any) {
    console.error("Error in referrals API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer to verify access
    const { data: customer } = await supabase
      .from("customers")
      .select("team_id")
      .eq("id", params.id)
      .single();

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Verify user is team member
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", customer.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      referred_name,
      referred_phone,
      referred_email,
      referred_address,
    } = body;

    if (!referred_name) {
      return NextResponse.json(
        { error: "referred_name is required" },
        { status: 400 }
      );
    }

    // Create referral using function
    const { data: referral_id, error } = await supabase.rpc(
      "create_referral",
      {
        p_customer_id: params.id,
        p_referred_name: referred_name,
        p_referred_phone: referred_phone,
        p_referred_email: referred_email,
        p_referred_address: referred_address,
      }
    );

    if (error) {
      console.error("Error creating referral:", error);
      return NextResponse.json(
        { error: "Failed to create referral" },
        { status: 500 }
      );
    }

    // Fetch created referral
    const { data: referral } = await supabase
      .from("referrals")
      .select("*")
      .eq("id", referral_id)
      .single();

    return NextResponse.json({
      ok: true,
      referral,
    });
  } catch (error: any) {
    console.error("Error in referrals API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















