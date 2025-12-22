// app/api/campaigns/[campaignId]/lead-reply-draft/route.ts

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: Request,
  { params }: { params: { campaignId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { leadId, tone, length } = await req.json().catch(() => ({}));

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const functionUrl = `${supabaseUrl}/functions/v1/generate-reply-draft`;

    const res = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        campaign_id: params.campaignId,
        lead_id: leadId,
        tone: tone ?? "neutral",
        length: length ?? "medium",
      }),
    });

    // Block 8470 — Pass through 402 status for plan gating
    if (res.status === 402) {
      const text = await res.text();
      return NextResponse.json(
        { error: text || "Smart reply drafts are only available on Pro plans." },
        { status: 402 }
      );
    }

    if (!res.ok) {
      const text = await res.text();
      console.error("generate-reply-draft failed:", res.status, text);
      return NextResponse.json(
        { error: "generate-reply-draft failed" },
        { status: 500 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Error calling generate-reply-draft:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

