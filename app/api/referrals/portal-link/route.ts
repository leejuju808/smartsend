import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/referrals/portal-link
 * Get referral link for a homeowner portal
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const portalToken = searchParams.get("portalToken");

    if (!portalToken) {
      return NextResponse.json(
        { error: "portalToken is required" },
        { status: 400 }
      );
    }

    // Get portal
    const { data: portal } = await supabase
      .from("homeowner_portals")
      .select("id, job_id")
      .eq("portal_token", portalToken)
      .eq("is_enabled", true)
      .single();

    if (!portal) {
      return NextResponse.json(
        { error: "Portal not found" },
        { status: 404 }
      );
    }

    // Get referral link
    const { data: referralLink } = await supabase
      .from("referral_links")
      .select("*")
      .eq("portal_id", portal.id)
      .single();

    if (!referralLink) {
      return NextResponse.json(
        { error: "Referral link not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ referralLink });
  } catch (error: any) {
    console.error("Error in GET /api/referrals/portal-link:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























