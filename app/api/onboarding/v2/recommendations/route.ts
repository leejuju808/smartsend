// Block 16800 — SmartSend Trials & Onboarding v2
// GET /api/onboarding/v2/recommendations - Returns onboarding recommendations

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const includeDismissed = searchParams.get("include_dismissed") === "true";

  // Get onboarding progress for context
  const { data: progress } = await supabase
    .from("onboarding_progress")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Get recommendations
  let query = supabase
    .from("onboarding_recommendations")
    .select("*")
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (!includeDismissed) {
    query = query.eq("dismissed", false);
  }

  const { data: recommendations, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If no recommendations exist, generate some based on progress
  if (!recommendations || recommendations.length === 0) {
    const generatedRecommendations = await generateRecommendations(supabase, user.id, progress);
    return NextResponse.json({ recommendations: generatedRecommendations });
  }

  return NextResponse.json({ recommendations });
}

async function generateRecommendations(
  supabase: any,
  userId: string,
  progress: any
): Promise<any[]> {
  const recommendations: any[] = [];

  // Get account_id
  const accountId = progress?.account_id;

  // Recommendation 1: Storm Campaign (if city/service area is set)
  if (progress?.company_city || progress?.service_areas?.length > 0) {
    recommendations.push({
      user_id: userId,
      account_id: accountId,
      recommendation_type: "storm_campaign",
      title: "Start with this Storm Outreach",
      description: `We detected storm activity in ${progress.company_city || "your area"}. Launch a targeted storm campaign to homeowners who need roof inspections.`,
      action_url: "/dashboard/campaigns/new?template=storm",
      priority: 10,
      personalization_data: {
        city: progress.company_city,
        service_areas: progress.service_areas,
      },
    });
  }

  // Recommendation 2: Old Quote Revival (if list imported)
  if (progress?.step_3_list_imported) {
    recommendations.push({
      user_id: userId,
      account_id: accountId,
      recommendation_type: "old_quote_revival",
      title: "Try Old Quote Revival",
      description: "Reach out to homeowners who received quotes but didn't book. Perfect for converting warm leads.",
      action_url: "/dashboard/campaigns/new?template=old_quote",
      priority: 8,
    });
  }

  // Recommendation 3: Neighborhood Campaign
  if (progress?.company_city) {
    recommendations.push({
      user_id: userId,
      account_id: accountId,
      recommendation_type: "neighborhood_outreach",
      title: `Neighborhood Campaign for ${progress.company_city}`,
      description: "Target homeowners in your service area with personalized neighborhood outreach.",
      action_url: "/dashboard/campaigns/new?template=neighborhood",
      priority: 7,
      personalization_data: {
        city: progress.company_city,
      },
    });
  }

  // Recommendation 4: Insurance Claim Prep
  recommendations.push({
    user_id: userId,
    account_id: accountId,
    recommendation_type: "insurance_claim_prep",
    title: "Insurance Claim Prep",
    description: "Help homeowners navigate insurance claims with our proven template.",
    action_url: "/dashboard/campaigns/new?template=insurance",
    priority: 6,
  });

  // Insert recommendations
  if (recommendations.length > 0) {
    await supabase.from("onboarding_recommendations").insert(recommendations);
  }

  return recommendations;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recommendation_id, action } = body as {
    recommendation_id: string;
    action: "click" | "dismiss";
  };

  const updateData: any = {};
  if (action === "click") {
    updateData.clicked = true;
    updateData.shown = true;
  } else if (action === "dismiss") {
    updateData.dismissed = true;
  }

  const { data: recommendation, error } = await supabase
    .from("onboarding_recommendations")
    .update(updateData)
    .eq("id", recommendation_id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recommendation });
}





















































