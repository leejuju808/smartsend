/**
 * Track A/B test events (opens, replies, booked estimates, closed jobs)
 * Called by webhook handlers and event processors
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();
  const campaignId = params.id;

  try {
    const body = await req.json();
    const { event_type, lead_id, variant_id } = body;

    if (!event_type || !lead_id) {
      return NextResponse.json(
        { error: "event_type and lead_id are required" },
        { status: 400 }
      );
    }

    // If variant_id not provided, look it up from assignment
    let finalVariantId = variant_id;
    if (!finalVariantId) {
      const { data: assignment } = await supabase
        .from("ab_variant_assignments")
        .select("variant_id")
        .eq("campaign_id", campaignId)
        .eq("lead_id", lead_id)
        .single();

      if (!assignment) {
        return NextResponse.json(
          { error: "No variant assignment found for this lead" },
          { status: 404 }
        );
      }

      finalVariantId = assignment.variant_id;
    }

    // Map event types to metric types
    const metricTypeMap: Record<string, string> = {
      open: "open",
      opened: "open",
      reply: "reply",
      replied: "reply",
      booked_estimate: "booked_estimate",
      estimate_booked: "booked_estimate",
      closed_job: "closed_job",
      job_closed: "closed_job",
    };

    const metricType = metricTypeMap[event_type.toLowerCase()];
    if (!metricType) {
      return NextResponse.json(
        { error: `Unknown event type: ${event_type}` },
        { status: 400 }
      );
    }

    // Increment metric
    const { error: incrementError } = await supabase.rpc("increment_ab_metric", {
      p_variant_id: finalVariantId,
      p_metric_type: metricType,
      p_increment: 1,
    });

    if (incrementError) {
      return NextResponse.json({ error: incrementError.message }, { status: 500 });
    }

    // Update ZIP code performance if zip_code is available
    if (body.zip_code) {
      const { data: assignment } = await supabase
        .from("ab_variant_assignments")
        .select("zip_code")
        .eq("campaign_id", campaignId)
        .eq("lead_id", lead_id)
        .single();

      if (assignment?.zip_code) {
        // Upsert ZIP performance
        const { error: zipError } = await supabase
          .from("ab_zip_performance")
          .upsert({
            campaign_id: campaignId,
            variant_id: finalVariantId,
            zip_code: assignment.zip_code,
            [metricType === "open" ? "opens" : 
             metricType === "reply" ? "replies" :
             metricType === "booked_estimate" ? "booked_estimates" :
             "closed_jobs"]: 1,
          }, {
            onConflict: "campaign_id,variant_id,zip_code",
          });

        if (zipError) {
          console.error("Failed to update ZIP performance:", zipError);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



























