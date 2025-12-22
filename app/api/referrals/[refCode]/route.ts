import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/referrals/[refCode]
 * Get referral link data for public landing page
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ refCode: string }> }
) {
  try {
    const supabase = await createClient();
    const { refCode } = await params;

    // Get referral link with job and homeowner info
    const { data: referralLink, error } = await supabase
      .from("referral_links")
      .select(`
        *,
        homeowner_portals!inner(
          id,
          job_id,
          roofing_jobs!inner(
            id,
            title,
            workspace_id,
            leads(
              id,
              first_name,
              last_name,
              email
            )
          )
        )
      `)
      .eq("ref_code", refCode.toUpperCase())
      .single();

    if (error || !referralLink) {
      return NextResponse.json(
        { error: "Referral link not found" },
        { status: 404 }
      );
    }

    // Get job photos for before/after gallery
    const { data: photos } = await supabase
      .from("job_field_photos")
      .select("id, photo_url, photo_type, created_at")
      .eq("job_id", referralLink.job_id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      referralLink,
      photos: photos || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/referrals/[refCode]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























