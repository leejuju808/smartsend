import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { checkDNSRecordsServer } from "@/lib/warmup/dns-checker";
import { 
  analyzeContentRisk, 
  calculateRiskScore, 
  getRecommendations,
  type WarmupCheckResult 
} from "@/lib/warmup/risk-calculator";

export async function POST(
  req: NextRequest,
  { params }: { params: { accountId: string } }
) {
  try {
    const supabase = await getServerSupabase();
    const accountId = params.accountId;

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get account details
    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("id, email_address, account_email, email, domain, workspace_id, created_at")
      .eq("id", accountId)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Check workspace access
    if (account.workspace_id) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", account.workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!member) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    const emailAddress = account.email_address || account.account_email || account.email || "";
    const domain = account.domain || emailAddress.split("@")[1] || "";

    if (!domain) {
      return NextResponse.json(
        { error: "Could not determine domain" },
        { status: 400 }
      );
    }

    // Check DNS records
    const dnsStatus = await checkDNSRecordsServer(domain);

    // Get volume stats
    const { data: volumeStats, error: volumeError } = await supabase.rpc(
      "get_sending_volume_stats",
      {
        p_email_address: emailAddress,
        p_workspace_id: account.workspace_id,
      }
    );

    const volumes = volumeStats || { last_24h: 0, last_7d: 0, last_30d: 0 };

    // Get upcoming campaigns to analyze content risk
    let contentRisk = { links: 0, images: 0, spammy_terms: [], all_caps_subject: false, exclamation_count: 0 };
    
    if (account.workspace_id) {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select(`
          id,
          campaign_steps!inner (
            id,
            subject,
            body,
            body_html,
            content_risk
          )
        `)
        .eq("workspace_id", account.workspace_id)
        .in("status", ["draft", "scheduled", "running"])
        .limit(5);

      if (campaigns && campaigns.length > 0) {
        // Analyze first step of first campaign
        const firstStep = campaigns[0]?.campaign_steps?.[0];
        if (firstStep) {
          // Use cached content_risk if available, otherwise analyze
          if (firstStep.content_risk && typeof firstStep.content_risk === 'object') {
            contentRisk = firstStep.content_risk as any;
          } else {
            contentRisk = analyzeContentRisk(
              firstStep.subject || "",
              firstStep.body_html || firstStep.body || undefined,
              firstStep.body || undefined
            );
          }
        }
      }
    }

    // Calculate domain age
    const domainAgeDays = account.created_at
      ? Math.floor((Date.now() - new Date(account.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : undefined;
    const isNewDomain = domainAgeDays !== undefined && domainAgeDays < 30;

    // Calculate risk score
    const { score, risk_level, reasons } = calculateRiskScore(
      dnsStatus,
      volumes,
      contentRisk,
      domainAgeDays,
      isNewDomain
    );

    // Get recommendations
    const recommendations = getRecommendations(reasons);

    // Calculate suggested daily limit
    const suggestedDailyLimit = risk_level === "high" ? 50 : risk_level === "medium" ? 100 : 200;

    // Update account with risk data
    await supabase
      .from("connected_accounts")
      .update({
        last_risk_score: score,
        last_risk_reason: {
          dns_status: dnsStatus,
          volume_stats: volumes,
          reasons: reasons,
        },
        last_risk_checked_at: new Date().toISOString(),
        suggested_daily_limit: suggestedDailyLimit,
        domain: domain,
      })
      .eq("id", accountId);

    // Build result
    const result: WarmupCheckResult = {
      score,
      risk_level,
      reasons,
      recommendations,
      suggested_daily_limit: suggestedDailyLimit,
      dns_status: dnsStatus,
      volume_stats: volumes,
      checked_at: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Warmup check error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run warmup check" },
      { status: 500 }
    );
  }
}





























































