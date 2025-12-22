// app/api/ai/personalization/opener/route.ts
// Block 15400: AI Personalization Engine v1
// API route to get or create personalized opener

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getOrCreateOpener } from "@/lib/ai/getOrCreateOpener";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, contactId, campaignId, stepId } = body;

    if (!workspaceId || !contactId || !campaignId || !stepId) {
      return NextResponse.json(
        { error: "Missing required parameters: workspaceId, contactId, campaignId, stepId" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const opener = await getOrCreateOpener(supabase, {
      workspaceId,
      contactId,
      campaignId,
      stepId,
    });

    if (!opener) {
      return NextResponse.json(
        { error: "Failed to generate opener. Check plan limits or LLM configuration." },
        { status: 500 }
      );
    }

    return NextResponse.json({ opener });
  } catch (error: any) {
    console.error("Error generating opener:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate opener" },
      { status: 500 }
    );
  }
}



























































