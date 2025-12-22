import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/[id]/scrub
 * Trigger AI lead scrubbing and qualification for a specific lead
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lead_id } = await params;
    const body = await req.json().catch(() => ({}));
    const { source = "api" } = body;

    if (!lead_id) {
      return NextResponse.json(
        { error: "Missing lead_id" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Fetch lead data
    const supabase = createServerClient();
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Call lead-scrub edge function
    const scrubResponse = await fetch(
      `${supabaseUrl}/functions/v1/lead-scrub`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          lead_id,
          lead_data: lead,
          source,
        }),
      }
    );

    if (!scrubResponse.ok) {
      const errorData = await scrubResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || "Lead scrubbing failed" },
        { status: scrubResponse.status }
      );
    }

    const scrubResult = await scrubResponse.json();

    // If scrubbing succeeded, trigger routing
    if (scrubResult.ok && scrubResult.result?.score !== undefined) {
      // Optionally trigger routing in the background
      fetch(`${supabaseUrl}/functions/v1/lead-routing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ lead_id }),
      }).catch((err) => {
        console.error("Failed to trigger lead routing:", err);
      });
    }

    return NextResponse.json({
      ok: true,
      ...scrubResult,
    });
  } catch (error: any) {
    console.error("Error in lead scrub API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































