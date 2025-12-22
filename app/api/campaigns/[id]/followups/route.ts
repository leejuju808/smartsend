// app/api/campaigns/[id]/followups/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { step2, step3 } = body;

  // Verify user has access to this campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id")
    .eq("id", params.id)
    .maybeSingle();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Check workspace access
  const { data: member } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Delete old follow-ups for this campaign
  await supabase
    .from("campaign_followups")
    .delete()
    .eq("campaign_id", params.id);

  const rows = [];
  if (step2 && step2.subject && step2.body) {
    rows.push({
      campaign_id: params.id,
      step: 2,
      wait_days: step2.wait_days || 2,
      subject: step2.subject,
      body: step2.body,
    });
  }
  if (step3 && step3.subject && step3.body) {
    rows.push({
      campaign_id: params.id,
      step: 3,
      wait_days: step3.wait_days || 2,
      subject: step3.subject,
      body: step3.body,
    });
  }

  if (rows.length) {
    const { error } = await supabase.from("campaign_followups").insert(rows);
    if (error) {
      console.error("Follow-up save error:", error);
      return NextResponse.json({ error: "Failed to save follow-ups" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: followups, error } = await supabase
    .from("campaign_followups")
    .select("*")
    .eq("campaign_id", params.id)
    .order("step", { ascending: true });

  if (error) {
    console.error("Follow-up fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch follow-ups" }, { status: 500 });
  }

  // Format response
  const result: any = {};
  followups?.forEach((f) => {
    if (f.step === 2) {
      result.step2 = {
        wait_days: f.wait_days,
        subject: f.subject,
        body: f.body,
      };
    } else if (f.step === 3) {
      result.step3 = {
        wait_days: f.wait_days,
        subject: f.subject,
        body: f.body,
      };
    }
  });

  return NextResponse.json(result);
}

























































