// Block 14100 — AI Personalization Engine v1
// POST /api/ai/personalize-campaign - Personalize campaign copy using workspace profile

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { personalizeCampaignCopy } from "@/lib/ai/personalizeCampaign";

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { campaignName, steps, workspaceId } = body as {
    campaignName: string;
    steps: {
      step_order: number;
      delay_days: number;
      subject: string;
      body: string;
    }[];
    workspaceId: string;
  };

  if (!campaignName || !steps?.length || !workspaceId) {
    return NextResponse.json(
      { error: "Missing campaignName, steps or workspaceId" },
      { status: 400 },
    );
  }

  // auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // load workspace + profile
  const { data: ws, error: wsError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .single();

  if (wsError || !ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("workspace_profile")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  const workspaceProfile = {
    company_name: profile?.company_name ?? null,
    niche: profile?.niche ?? "roofing",
    primary_city: profile?.primary_city ?? null,
    service_area: profile?.service_area ?? null,
    typical_job_types: profile?.typical_job_types ?? null,
    avg_job_value: profile?.avg_job_value ?? null,
    tone_style: profile?.tone_style ?? null,
  };

  try {
    const rewrittenSteps = await personalizeCampaignCopy({
      workspaceProfile,
      campaignName,
      steps,
    });

    return NextResponse.json({ steps: rewrittenSteps });
  } catch (err: any) {
    console.error("AI personalization error", err);
    return NextResponse.json(
      { error: "Failed to personalize campaign" },
      { status: 500 },
    );
  }
}



























































