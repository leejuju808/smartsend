// Block 24900 — Follow-Up Brain v2: Process Pending Sequences API Route

import { NextRequest, NextResponse } from "next/server";
import { processPendingSequences } from "@/lib/followup-brain-v2/sequences";

export async function POST(req: NextRequest) {
  try {
    const sent = await processPendingSequences();

    return NextResponse.json({
      ok: true,
      sent,
      message: `Processed ${sent} sequence emails`,
    });
  } catch (error: any) {
    console.error('Error processing sequences:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






































