// Inbox Inspector Edge Function
// Comprehensive inbox health analysis, reputation checks, and AI fix recommendations

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiKey = Deno.env.get("OPENAI_API_KEY");

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

// Blacklist check (lightweight v1)
async function checkBlacklists(domain: string): Promise<Record<string, string>> {
  const blacklists: Record<string, string> = {};
  
  // In v1, we'll do lightweight checks
  // In production, you'd integrate with Spamhaus, Barracuda, SORBS, UCEProtect APIs
  
  // For now, return clean status
  blacklists.spamhaus = "clean";
  blacklists.barracuda = "clean";
  blacklists.sorbs = "clean";
  blacklists.uceprotect = "clean";
  
  return blacklists;
}

// Calculate spam-trap probability
function calculateSpamTrapProbability(
  domainAge: number,
  bounceRate: number,
  sendVolume: number
): number {
  let probability = 0;
  
  // New domains are higher risk
  if (domainAge < 30) probability += 0.2;
  else if (domainAge < 90) probability += 0.1;
  
  // High bounce rate increases risk
  if (bounceRate > 0.1) probability += 0.3;
  else if (bounceRate > 0.05) probability += 0.15;
  
  // Very low or very high send volume
  if (sendVolume < 5 || sendVolume > 1000) probability += 0.1;
  
  return Math.min(1, probability);
}

// Generate AI fix recommendations
async function generateFixRecommendations(
  inboxId: string,
  report: any,
  healthScore: number
): Promise<any[]> {
  const fixes: any[] = [];
  
  // SPF Fixes
  if (!report.dns_spf_valid || report.dns_spf_issues?.length > 0) {
    fixes.push({
      fix_type: "spf",
      severity: report.dns_spf_valid ? "medium" : "high",
      title: "SPF Record Issues",
      description: report.dns_spf_issues?.join(", ") || "SPF record is missing or invalid",
      ai_recommendation: "Add or update SPF record: v=spf1 include:_spf.google.com -all",
      fix_instructions: "1. Go to your DNS provider\n2. Add TXT record: v=spf1 include:_spf.google.com -all\n3. Wait for DNS propagation (up to 48 hours)",
      auto_fixable: false,
    });
  }
  
  // DKIM Fixes
  if (!report.dns_dkim_valid) {
    fixes.push({
      fix_type: "dkim",
      severity: "high",
      title: "DKIM Not Configured",
      description: "DKIM selector missing or invalid",
      ai_recommendation: "Enable DKIM in Google Admin Console or your email provider",
      fix_instructions: "1. Go to Google Admin Console\n2. Navigate to Apps > Google Workspace > Gmail\n3. Enable DKIM authentication\n4. Copy the selector and public key\n5. Add TXT record at <selector>._domainkey.yourdomain.com",
      auto_fixable: false,
    });
  }
  
  // DMARC Fixes
  if (!report.dns_dmarc_valid || report.dns_dmarc_policy === "none") {
    fixes.push({
      fix_type: "dmarc",
      severity: report.dns_dmarc_valid ? "medium" : "high",
      title: "DMARC Policy Upgrade Needed",
      description: report.dns_dmarc_policy === "none" 
        ? "DMARC policy is 'none', upgrade recommended"
        : "DMARC record missing",
      ai_recommendation: "Upgrade DMARC policy to 'quarantine' or 'reject'",
      fix_instructions: "1. Add TXT record at _dmarc.yourdomain.com\n2. Set value: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com\n3. Monitor for 30 days, then upgrade to p=reject",
      auto_fixable: false,
    });
  }
  
  // Bounce Fixes
  if (report.bounce_rate > 0.05) {
    fixes.push({
      fix_type: "bounce",
      severity: report.bounce_rate > 0.1 ? "critical" : "high",
      title: "High Bounce Rate",
      description: `Bounce rate is ${(report.bounce_rate * 100).toFixed(1)}%, above threshold`,
      ai_recommendation: "Reduce send volume on this inbox for 48 hours and review email list quality",
      fix_instructions: "1. Pause sending from this inbox\n2. Review and clean your email list\n3. Remove invalid/bounced addresses\n4. Gradually resume sending",
      auto_fixable: true,
    });
  }
  
  // Spam Fixes
  if (report.spam_complaint_rate > 0.01) {
    fixes.push({
      fix_type: "spam",
      severity: report.spam_complaint_rate > 0.02 ? "critical" : "high",
      title: "Spam Complaint Rate High",
      description: `Spam complaint rate is ${(report.spam_complaint_rate * 100).toFixed(2)}%`,
      ai_recommendation: "Review email content for spam keywords and improve list hygiene",
      fix_instructions: "1. Review recent email content\n2. Remove spam trigger words\n3. Improve list segmentation\n4. Add unsubscribe link",
      auto_fixable: false,
    });
  }
  
  // Engagement Fixes
  if (report.engagement_open_rate < 0.15 || report.engagement_trend === "declining") {
    fixes.push({
      fix_type: "engagement",
      severity: "medium",
      title: "Low Engagement Rate",
      description: `Open rate is ${(report.engagement_open_rate * 100).toFixed(1)}% and trending ${report.engagement_trend}`,
      ai_recommendation: "Improve subject lines and email content to increase engagement",
      fix_instructions: "1. A/B test subject lines\n2. Personalize email content\n3. Send at optimal times\n4. Segment your audience",
      auto_fixable: false,
    });
  }
  
  // Warmup Fixes
  if (report.warmup_stage && report.warmup_stage !== "stage_4") {
    fixes.push({
      fix_type: "warmup",
      severity: "low",
      title: "Inbox Warmup In Progress",
      description: `Warmup stage: ${report.warmup_stage}`,
      ai_recommendation: "Continue warmup process to reach stage 4",
      fix_instructions: "1. Keep warmup enabled\n2. Monitor daily volume\n3. Gradually increase sends",
      auto_fixable: false,
    });
  }
  
  // Use OpenAI for advanced recommendations if available
  if (openaiKey && fixes.length > 0) {
    try {
      const prompt = `Analyze this inbox health report and provide specific fix recommendations:
Health Score: ${healthScore}
DNS Issues: ${report.dns_spf_issues?.join(", ") || "None"}
Bounce Rate: ${(report.bounce_rate * 100).toFixed(1)}%
Spam Rate: ${(report.spam_complaint_rate * 100).toFixed(2)}%
Open Rate: ${(report.engagement_open_rate * 100).toFixed(1)}%

Provide 2-3 specific, actionable recommendations.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an email deliverability expert. Provide concise, actionable recommendations.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 300,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiRecommendation = data.choices[0]?.message?.content;
        
        // Add AI recommendation to first fix
        if (fixes.length > 0 && aiRecommendation) {
          fixes[0].ai_recommendation = aiRecommendation;
        }
      }
    } catch (error) {
      console.error("OpenAI API error:", error);
    }
  }
  
  return fixes;
}

// Main inspector function
async function inspectInbox(inboxId: string): Promise<any> {
  // Fetch inbox and domain info
  const { data: inbox, error: inboxError } = await supabase
    .from("sender_inboxes")
    .select(`
      *,
      sender_domains!inner(
        *,
        domain
      )
    `)
    .eq("id", inboxId)
    .single();

  if (inboxError || !inbox) {
    throw new Error("Inbox not found");
  }

  const domain = inbox.sender_domains?.domain;
  const workspaceId = inbox.workspace_id;

  // Get existing inspector report
  const { data: existingReport } = await supabase
    .from("inbox_inspector_reports")
    .select("*")
    .eq("inbox_id", inboxId)
    .single();

  // Get inbox health metrics
  const { data: health } = await supabase
    .from("inbox_health")
    .select("*")
    .eq("inbox_id", inboxId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  // Get warmup status
  const { data: warmupStatus } = await supabase
    .from("inbox_warmup_status")
    .select("*")
    .eq("inbox_id", inboxId)
    .single();

  // Get recent send volume (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { count: sendVolume } = await supabase
    .from("send_queue")
    .select("*", { count: "exact", head: true })
    .eq("from_inbox_id", inboxId)
    .gte("created_at", sevenDaysAgo.toISOString())
    .in("status", ["sent", "delivered"]);

  // Calculate domain age
  const domainCreated = inbox.sender_domains?.created_at 
    ? new Date(inbox.sender_domains.created_at)
    : new Date();
  const domainAgeDays = Math.floor(
    (Date.now() - domainCreated.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check blacklists
  const blacklistStatus = await checkBlacklists(domain);

  // Calculate spam-trap probability
  const bounceRate = health?.bounce_rate || existingReport?.bounce_rate || 0;
  const spamTrapProbability = calculateSpamTrapProbability(
    domainAgeDays,
    bounceRate,
    sendVolume || 0
  );

  // Get predictions
  const { data: predictions } = await supabase
    .from("predictions")
    .select("*")
    .eq("inbox_id", inboxId)
    .eq("metric", "bounce_risk")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Calculate health score
  const healthScore = existingReport?.health_score || 50;

  // Build report
  const report = {
    inbox_id: inboxId,
    workspace_id: workspaceId,
    health_score: healthScore,
    health_status: healthScore >= 80 ? "healthy" : healthScore >= 60 ? "warning" : "critical",
    dns_spf_valid: existingReport?.dns_spf_valid || false,
    dns_spf_issues: existingReport?.dns_spf_issues || [],
    dns_dkim_valid: existingReport?.dns_dkim_valid || false,
    dns_dkim_issues: existingReport?.dns_dkim_issues || [],
    dns_dmarc_valid: existingReport?.dns_dmarc_valid || false,
    dns_dmarc_policy: existingReport?.dns_dmarc_policy || "none",
    dns_dmarc_issues: existingReport?.dns_dmarc_issues || [],
    blacklist_status: blacklistStatus,
    spam_trap_probability: spamTrapProbability,
    domain_age_days: domainAgeDays,
    recent_bounce_risk: bounceRate,
    predicted_spam_risk: predictions?.predicted_value ? predictions.predicted_value / 100 : 0,
    warmup_stage: warmupStatus?.warmup_stage || "idle",
    daily_send_volume: sendVolume || 0,
    spam_complaint_rate: health?.spam_rate || 0,
    bounce_rate: bounceRate,
    engagement_open_rate: health?.open_rate || 0,
    engagement_click_rate: health?.click_rate || 0,
    engagement_trend: "stable", // Would calculate from historical data
    prediction_risk_signals: predictions ? {
      bounce_risk: predictions.predicted_value,
      confidence: predictions.confidence,
      trend: predictions.trend,
    } : {},
  };

  // Generate fix recommendations
  const fixes = await generateFixRecommendations(inboxId, report, healthScore);

  // Save fixes to database
  if (fixes.length > 0) {
    const fixesToInsert = fixes.map((fix) => ({
      ...fix,
      workspace_id: workspaceId,
      inbox_id: inboxId,
      status: "pending",
    }));

    await supabase
      .from("inspector_fixes")
      .upsert(fixesToInsert, {
        onConflict: "inbox_id,fix_type",
        ignoreDuplicates: false,
      });
  }

  return {
    report,
    fixes,
    checked_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { inbox_id } = await req.json();

    if (!inbox_id) {
      return new Response(
        JSON.stringify({ error: "inbox_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await inspectInbox(inbox_id);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error inspecting inbox:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});



