// Block 21380 — SmartSend Roofing Job Health Score v1

// API route: compute & persist lead score for a given lead

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateLeadScore, LeadIntentLabel } from "@/lib/leadScoring";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service role client: server-only, full access (respect RLS design!)
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function POST(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  try {
    const leadId = params.leadId;

    if (!leadId) {
      return NextResponse.json(
        { error: "Missing leadId in route params" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const {
      lastMessageBody,
      lastMessageAt,
      intentLabel,
      serviceAreas,
    }: {
      lastMessageBody: string;
      lastMessageAt: string;
      intentLabel: LeadIntentLabel;
      serviceAreas?: string[];
    } = body;

    if (!lastMessageBody || !lastMessageAt || !intentLabel) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: lastMessageBody, lastMessageAt, intentLabel",
        },
        { status: 400 }
      );
    }

    // 1️⃣ Calculate breakdown using our helper
    const breakdown = calculateLeadScore({
      lastMessageBody,
      lastMessageAt,
      intentLabel,
      serviceAreas,
    });

    // 2️⃣ Persist into Supabase
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        score_total: breakdown.score_total,
        score_intent: breakdown.score_intent,
        score_recency: breakdown.score_recency,
        score_keyword_match: breakdown.score_keyword_match,
        score_locality_match: breakdown.score_locality_match,
        score_last_updated: breakdown.score_last_updated,
      })
      .eq("id", leadId);

    if (updateError) {
      console.error("Error updating lead score:", updateError);
      return NextResponse.json(
        { error: "Failed to update lead score" },
        { status: 500 }
      );
    }

    // 3️⃣ Return the full breakdown so UI can react immediately
    return NextResponse.json(
      {
        leadId,
        ...breakdown,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in score route:", err);
    return NextResponse.json(
      { error: "Unexpected error computing lead score" },
      { status: 500 }
    );
  }
}















































