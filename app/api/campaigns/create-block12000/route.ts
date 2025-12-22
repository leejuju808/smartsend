/**
 * Block 12000 — Example Campaign Creation Route with Subscription Enforcement
 * 
 * This is an example API route that demonstrates how to use Block 12000
 * subscription enforcement middleware.
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  requireSubscriptionAndCampaignLimit,
} from "@/lib/billing/subscription-middleware";
import { incrementEmailUsage } from "@/lib/billing/subscription-enforcement";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore,
    });

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Block 12000: Check subscription and campaign limit
    const limitCheck = await requireSubscriptionAndCampaignLimit(user.id);
    if (limitCheck) {
      return limitCheck;
    }

    // Parse request body
    const body = await req.json();
    const { name, subject, body_html } = body;

    if (!name || !subject || !body_html) {
      return NextResponse.json(
        { error: "Missing required fields: name, subject, body_html" },
        { status: 400 }
      );
    }

    // Create campaign
    const { data: campaign, error: createError } = await supabase
      .from("campaigns")
      .insert({
        user_id: user.id,
        name,
        subject,
        body_html,
        status: "draft",
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating campaign:", createError);
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error: any) {
    console.error("Campaign creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































