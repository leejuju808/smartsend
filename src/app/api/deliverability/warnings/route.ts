import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");

  if (!teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  try {
    // Get last 7 days data from MV
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await sb
      .from("mv_deliverability_daily")
      .select("*")
      .eq("team_id", teamId)
      .gte("day", since)
      .order("day", { ascending: true });

    if (error) throw error;

    // Calculate averages
    let totalSent = 0;
    let totalBounces = 0;
    let totalComplaints = 0;
    
    data?.forEach((d: any) => {
      totalSent += d.sent || 0;
      totalBounces += (d.soft_bounces || 0) + (d.hard_bounces || 0);
      totalComplaints += d.complaints || 0;
    });

    const bounceRate = totalSent > 0 ? (100 * totalBounces / totalSent) : 0;
    const complaintRate = totalSent > 0 ? (100 * totalComplaints / totalSent) : 0;

    // Get domain health (from sender_domains table)
    const { data: domains, error: domainError } = await sb
      .from("sender_domains")
      .select("health_score")
      .eq("team_id", teamId)
      .order("last_checked", { ascending: false })
      .limit(1);

    const domainHealth = domains && domains.length > 0 ? domains[0].health_score : null;

    return NextResponse.json({
      bounceRate: +bounceRate.toFixed(2),
      complaintRate: +complaintRate.toFixed(2),
      domainHealth: domainHealth ? +domainHealth : null,
      bounceMsg: bounceRate >= 3 ? `${bounceRate.toFixed(2)}% over last 7 days` : undefined,
      complaintMsg: complaintRate >= 0.1 ? `${complaintRate.toFixed(2)}% over last 7 days` : undefined,
      domainMsg: domainHealth && domainHealth < 70 ? `Score ${domainHealth.toFixed(0)}/100` : undefined,
    });
  } catch (error: any) {
    console.error("Error fetching deliverability warnings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

