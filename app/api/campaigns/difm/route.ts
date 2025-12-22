// Block 96000 — Do-It-For-Me Campaign API Route
// POST /api/campaigns/difm
// Creates a fully-configured campaign with one click

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Invoke the createDoItForMeCampaign edge function
    const { data, error } = await supabase.functions.invoke("createDoItForMeCampaign", {
      body: {
        user_id: user.id,
      },
    });

    if (error) {
      console.error("Error invoking createDoItForMeCampaign:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create campaign" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, ...data }, { status: 200 });
  } catch (error: any) {
    console.error("Error in POST /api/campaigns/difm:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























