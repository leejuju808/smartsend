// PATCH /v1/steps/{id} - Update subject + body

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const PATCH = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const stepId = req.nextUrl.pathname.split("/").pop();
  if (!stepId) {
    throw new ApiError("400_INVALID_BODY", "Step ID is required");
  }

  const body = await req.json();
  const updates: any = {};

  if (body.subject !== undefined) {
    // Try different column names
    updates.subject = body.subject;
    updates.subject_template = body.subject;
  }

  if (body.body !== undefined || body.body_html !== undefined) {
    const bodyText = body.body || body.body_html;
    updates.body_html = bodyText;
    updates.body_html_template = bodyText;
  }

  // Handle A/B testing fields (Block 15200)
  if (body.ab_test_enabled !== undefined) {
    updates.ab_test_enabled = body.ab_test_enabled;
  }

  if (body.subject_variant_a !== undefined) {
    updates.subject_variant_a = body.subject_variant_a;
  }

  if (body.subject_variant_b !== undefined) {
    updates.subject_variant_b = body.subject_variant_b;
  }

  if (body.ab_test_winner !== undefined) {
    updates.ab_test_winner = body.ab_test_winner;
  }

  // When A/B testing is disabled, clear winner
  if (body.ab_test_enabled === false) {
    updates.ab_test_winner = null;
  }

  // When A/B testing is enabled, ensure variants are set
  if (body.ab_test_enabled === true) {
    // Fetch current step to get subject if variants are empty
    const { data: currentStep } = await supabase
      .from("smartsend_sequence_steps")
      .select("subject")
      .eq("id", stepId)
      .maybeSingle();
    
    if (currentStep?.subject) {
      if (!updates.subject_variant_a && !body.subject_variant_a) {
        updates.subject_variant_a = currentStep.subject;
      }
      if (!updates.subject_variant_b && !body.subject_variant_b) {
        updates.subject_variant_b = currentStep.subject;
      }
    }
  }

  // Try smartsend_sequence_steps first (used by UI)
  let { data: step, error } = await supabase
    .from("smartsend_sequence_steps")
    .update(updates)
    .eq("id", stepId)
    .select()
    .single();

  if (error || !step) {
    // Fallback: sequence_steps
    const { data: sequenceStep, error: sequenceStepError } = await supabase
      .from("sequence_steps")
      .update(updates)
      .eq("id", stepId)
      .select()
      .single();

    if (sequenceStepError || !sequenceStep) {
      // Fallback: campaign_steps
      const { data: campaignStep, error: campaignStepError } = await supabase
        .from("campaign_steps")
        .update(updates)
        .eq("id", stepId)
        .select()
        .single();

      if (campaignStepError || !campaignStep) {
        throw new ApiError("404_NOT_FOUND", "Step not found");
      }

      return NextResponse.json({ data: campaignStep });
    }

    return NextResponse.json({ data: sequenceStep });
  }

  return NextResponse.json({ data: step });
});



