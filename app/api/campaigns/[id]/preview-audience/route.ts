import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /api/campaigns/[id]/preview-audience
 * Returns the count of leads that would be targeted by this campaign's segment
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const campaignId = params.id;

    // Get campaign with segment_id
    const { data: campaign, error: campError } = await supabase
      .from("campaigns")
      .select("id, segment_id, account_id")
      .eq("id", campaignId)
      .single();

    if (campError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const segmentId = (campaign as any).segment_id;
    const accountId = (campaign as any).account_id;

    if (!segmentId) {
      // No segment = all leads for account
      const { count, error: countError } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("account_id", accountId);

      if (countError) {
        return NextResponse.json(
          { error: "Failed to count leads" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        count: count ?? 0,
        segment_id: null,
        segment_name: "All leads",
      });
    }

    // Validate segment exists
    const { data: segment, error: segError } = await supabase
      .from("segments")
      .select("id, name, account_id, is_active")
      .eq("id", segmentId)
      .eq("account_id", accountId)
      .single();

    if (segError || !segment) {
      return NextResponse.json(
        { error: "Segment not found or does not belong to this account" },
        { status: 404 }
      );
    }

    if (!segment.is_active) {
      return NextResponse.json(
        { error: "Segment is inactive" },
        { status: 400 }
      );
    }

    // Get count from materialized members (fastest)
    const { count, error: countError } = await supabase
      .from("lead_segment_members")
      .select("*", { count: "exact", head: true })
      .eq("segment_id", segmentId);

    if (countError) {
      // Fallback: try to compute on the fly (slower)
      // For now, return 0 and let the UI handle it
      return NextResponse.json({
        count: 0,
        segment_id: segmentId,
        segment_name: segment.name,
        note: "Segment members not yet computed. Run segment recompute to get accurate count.",
      });
    }

    return NextResponse.json({
      count: count ?? 0,
      segment_id: segmentId,
      segment_name: segment.name,
    });
  } catch (error: any) {
    console.error("Preview audience error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to preview audience" },
      { status: 500 }
    );
  }
}












