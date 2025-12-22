import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Get campaign steps to check for rotation
  const { data: steps, error: stepsError } = await supabase
    .from("campaign_steps")
    .select("sender_mode, rotation_domain_id")
    .eq("campaign_id", params.id)
    .eq("active", true)
    .limit(1);

  if (stepsError || !steps || steps.length === 0) {
    return NextResponse.json({ summary: null });
  }

  const step = steps[0];
  if (step.sender_mode !== 'rotation' || !step.rotation_domain_id) {
    return NextResponse.json({ summary: null });
  }

  // Get domain info
  const { data: domain } = await supabase
    .from("sender_domains")
    .select("id, domain")
    .eq("id", step.rotation_domain_id)
    .single();

  if (!domain) {
    return NextResponse.json({ summary: null });
  }

  // Get connected inboxes for this domain
  const { data: inboxes } = await supabase
    .from("sender_inboxes")
    .select(`
      id,
      inbox_health (
        score
      )
    `)
    .eq("domain_id", step.rotation_domain_id)
    .eq("connected", true);

  if (!inboxes || inboxes.length === 0) {
    return NextResponse.json({ summary: null });
  }

  // Calculate average health score
  const healthScores = inboxes
    .map((i: any) => i.inbox_health?.score ?? 50)
    .filter((s: number) => s > 0);
  const avgHealthScore = healthScores.length > 0
    ? Math.round(healthScores.reduce((a: number, b: number) => a + b, 0) / healthScores.length)
    : 50;

  // Estimate projected sends (sum of daily limits)
  const { data: inboxDetails } = await supabase
    .from("sender_inboxes")
    .select("daily_limit")
    .eq("domain_id", step.rotation_domain_id)
    .eq("connected", true);

  const projectedSends = inboxDetails
    ? inboxDetails.reduce((sum: number, i: any) => sum + (i.daily_limit || 100), 0)
    : inboxes.length * 100; // Default estimate

  return NextResponse.json({
    summary: {
      inboxCount: inboxes.length,
      healthScore: avgHealthScore,
      projectedSends,
      domainName: domain.domain,
    },
  });
}



