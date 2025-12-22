import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/agencies/create
 * Create a reseller/agency account
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, tier = "partner", custom_logo_url, custom_domain } =
      await req.json();

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    // Determine revenue share and branding based on tier
    const tierConfig: Record<string, { revenueShare: number; branding: string }> = {
      partner: { revenueShare: 20, branding: "powered_by" },
      pro: { revenueShare: 30, branding: "custom_logo" },
      elite: { revenueShare: 40, branding: "white_label" },
    };

    const config = tierConfig[tier] || tierConfig.partner;

    const { data: resellerAccount, error } = await supabaseAdmin
      .from("reseller_accounts")
      .insert({
        name,
        agency_admin_user_id: user.id,
        tier,
        revenue_share_percent: config.revenueShare,
        branding_level: config.branding,
        custom_logo_url: custom_logo_url || null,
        custom_domain: custom_domain || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating reseller account:", error);
      return NextResponse.json(
        { error: "Failed to create agency account" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reseller_account: resellerAccount,
    });
  } catch (error: any) {
    console.error("Agency creation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

