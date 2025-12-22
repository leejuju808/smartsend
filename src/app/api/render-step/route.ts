import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { campaign_id, lead_id, step_no } = await req.json();
    
    if (!campaign_id || !lead_id || !step_no) {
      return NextResponse.json(
        { error: "campaign_id, lead_id, step_no required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const renderRes = await fetch(`${supabaseUrl}/functions/v1/render-step`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Authorization": `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ campaign_id, lead_id, step_no })
    });

    const data = await renderRes.json();
    return NextResponse.json(data, { status: renderRes.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 }
    );
  }
}

