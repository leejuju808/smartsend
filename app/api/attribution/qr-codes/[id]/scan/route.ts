/**
 * Block 93000 — QR Code Scan Handler
 * Tracks QR code scans and creates/updates lead attribution
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { lead_id, email, referrer, user_agent } = body;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get QR code
    const { data: qrCode, error: qrError } = await supabase
      .from("qr_codes")
      .select("*, workspace_id")
      .eq("id", id)
      .single();

    if (qrError || !qrCode) {
      return NextResponse.json(
        { error: "QR code not found" },
        { status: 404 }
      );
    }

    // Increment scan count
    await supabase.rpc("increment", { x: 1 }).then(() => {
      return supabase
        .from("qr_codes")
        .update({
          scans: supabase.rpc("increment", { x: 1 }),
        })
        .eq("id", id);
    });

    // If lead_id provided, attribute the lead
    if (lead_id) {
      const { attributeFromQRCode } = await import("@/lib/attribution/attribution-helpers");
      await attributeFromQRCode(supabase, qrCode.workspace_id, lead_id, id);
    } else if (email) {
      // Find or create lead by email
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("workspace_id", qrCode.workspace_id)
        .maybeSingle();

      if (lead) {
        const { attributeFromQRCode } = await import("@/lib/attribution/attribution-helpers");
        await attributeFromQRCode(supabase, qrCode.workspace_id, lead.id, id);
      }
    }

    // Record touchpoint
    if (lead_id) {
      await supabase.from("attribution_touchpoints").insert({
        workspace_id: qrCode.workspace_id,
        lead_id: lead_id,
        source_id: qrCode.source_id || null,
        campaign_id: qrCode.campaign_id || null,
        touch_type: "qr_scan",
        touch_timestamp: new Date().toISOString(),
        metadata: {
          referrer: referrer || null,
          user_agent: user_agent || null,
        },
      });
    }

    return NextResponse.json({ success: true, qr_code: qrCode });
  } catch (error: any) {
    console.error("QR code scan error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process QR code scan" },
      { status: 500 }
    );
  }
}



























