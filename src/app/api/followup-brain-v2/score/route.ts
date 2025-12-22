// Block 24900 — Follow-Up Brain v2: Calculate Score API Route

import { NextRequest, NextResponse } from "next/server";
import { calculateFollowUpBrainScore, saveFollowUpBrainScore } from "@/lib/followup-brain-v2/scoring";

export async function POST(req: NextRequest) {
  try {
    const { workspace_id, lead_id, period_start, period_end } = await req.json();

    const start = period_start ? new Date(period_start) : undefined;
    const end = period_end ? new Date(period_end) : undefined;

    const score = await calculateFollowUpBrainScore(
      workspace_id,
      lead_id,
      start,
      end
    );

    // Save score
    await saveFollowUpBrainScore(score, workspace_id, lead_id, start, end);

    return NextResponse.json({
      ok: true,
      score,
    });
  } catch (error: any) {
    console.error('Error calculating score:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






































