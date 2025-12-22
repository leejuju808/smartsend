import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is a partner
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: partner } = await adminClient
      .from("partners")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!partner) {
      return NextResponse.json({ error: "Not a partner" }, { status: 404 });
    }

    // Fetch payouts for this partner
    const { data: payouts } = await adminClient
      .from("partner_payouts")
      .select("*")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      partner: {
        id: partner.id,
        role: partner.role,
        commission_rate: partner.commission_rate,
        referral_code: partner.referral_code,
        total_earned: partner.total_earned,
        created_at: partner.created_at
      },
      payouts: payouts || []
    });
  } catch (error) {
    console.error("Error in partners/me:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';

