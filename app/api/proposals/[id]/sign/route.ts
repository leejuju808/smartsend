// Block 57000 — API Route: POST /api/proposals/[id]/sign
// Handles proposal signature

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = createClient();

    const { signature, final_price, upsells, homeowner_name } = body;

    if (!signature) {
      return NextResponse.json(
        { error: "Signature is required" },
        { status: 400 }
      );
    }

    // Get client IP
    const clientIp = req.headers.get("x-forwarded-for") || 
                     req.headers.get("x-real-ip") || 
                     "unknown";

    // Call edge function to sign
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/proposal-sign`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          proposal_id: id,
          signature: {
            ...signature,
            ip_address: clientIp,
          },
          final_price,
          homeowner_name,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Error signing proposal:", error);
      return NextResponse.json(
        { error: "Failed to sign proposal" },
        { status: 500 }
      );
    }

    const data = await response.json();

    // Update upsells if provided
    if (upsells && Array.isArray(upsells)) {
      await supabase
        .from("proposals")
        .update({ upsells })
        .eq("id", id);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /api/proposals/[id]/sign:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































