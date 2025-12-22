import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is already a partner
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existingPartner } = await adminClient
      .from("partners")
      .select("referral_code, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingPartner) {
      return NextResponse.json({
        ok: true,
        code: existingPartner.referral_code,
        role: existingPartner.role,
        existing: true
      });
    }

    // Generate unique referral code
    const code = "SEND" + Array.from({ length: 6 }, () =>
      Math.random().toString(36).charAt(2).toUpperCase()
    ).join('');

    // Get user's org_id from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    const orgId = (profile as any)?.org_id || null;

    // Create partner record
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .insert({
        user_id: user.id,
        org_id: orgId,
        referral_code: code,
        role: "affiliate",
        commission_rate: 0.20
      })
      .select("id, referral_code, role, commission_rate")
      .single();

    if (partnerError) {
      console.error("Error creating partner:", partnerError);
      return NextResponse.json(
        { error: "Failed to create partner account" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      code: partner.referral_code,
      role: partner.role,
      commission_rate: partner.commission_rate
    });
  } catch (error) {
    console.error("Error in partners/join:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';

