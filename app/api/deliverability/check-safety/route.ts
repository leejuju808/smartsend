import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { org_id, domain_settings_id, to_email, campaign_id } = await req.json();

    if (!org_id || !domain_settings_id || !to_email) {
      return NextResponse.json(
        { error: "org_id, domain_settings_id, and to_email are required" },
        { status: 400 }
      );
    }

    // Check sending safety using database function
    const { data: safetyCheck, error: checkError } = await supabase.rpc(
      "check_sending_safety",
      {
        p_org_id: org_id,
        p_domain_settings_id: domain_settings_id,
        p_to_email: to_email,
        p_campaign_id: campaign_id || null,
      }
    );

    if (checkError) {
      return NextResponse.json(
        { error: checkError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      can_send: safetyCheck?.can_send || false,
      reason: safetyCheck?.reason || null,
      message: safetyCheck?.message || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































