// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let payload: any = {};
  try {
    payload = await req.json();
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { org_id, campaign_id, subject_line, email_body } = payload;

  if (!org_id || !subject_line || !email_body) {
    return new Response(JSON.stringify({ error: "org_id, subject_line, and email_body are required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Scan content
  const scanResult = await scanEmailContent(subject_line, email_body);

  // Save scan result
  const { data: scanRecord, error: insertError } = await supabase
    .from("content_spam_scans")
    .insert({
      org_id,
      campaign_id: campaign_id || null,
      subject_line,
      email_body: email_body.substring(0, 10000), // Limit length
      spam_score: scanResult.spam_score,
      risk_level: scanResult.risk_level,
      detected_issues: scanResult.detected_issues,
      flagged_keywords: scanResult.flagged_keywords,
      link_count: scanResult.link_count,
      image_count: scanResult.image_count,
      recommendations: scanResult.recommendations,
      scan_status: "completed",
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    console.error("Error saving scan:", insertError);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      scan_id: scanRecord?.id,
      spam_score: scanResult.spam_score,
      risk_level: scanResult.risk_level,
      detected_issues: scanResult.detected_issues,
      flagged_keywords: scanResult.flagged_keywords,
      link_count: scanResult.link_count,
      image_count: scanResult.image_count,
      recommendations: scanResult.recommendations,
      safe_to_send: scanResult.risk_level === "low" || scanResult.risk_level === "medium",
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
});

async function scanEmailContent(
  subject: string,
  body: string
): Promise<{
  spam_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  detected_issues: string[];
  flagged_keywords: string[];
  link_count: number;
  image_count: number;
  recommendations: string[];
}> {
  let spamScore = 0;
  const detectedIssues: string[] = [];
  const flaggedKeywords: string[] = [];
  const recommendations: string[] = [];

  const combinedText = `${subject} ${body}`.toLowerCase();

  // Spam phrases
  const spamPhrases = [
    "act now",
    "limited time",
    "click here",
    "buy now",
    "free money",
    "guaranteed",
    "risk-free",
    "no obligation",
    "call now",
    "urgent",
    "winner",
    "congratulations",
    "you've won",
    "claim now",
    "exclusive offer",
    "one-time deal",
    "don't delete",
    "this won't last",
    "order now",
    "special promotion",
  ];

  // Phishing-like phrases
  const phishingPhrases = [
    "verify your account",
    "suspended account",
    "click to verify",
    "account locked",
    "urgent action required",
    "security alert",
    "update your information",
  ];

  // Check subject line
  const subjectUpper = subject.toUpperCase();
  const allCapsRatio = (subjectUpper.match(/[A-Z]/g) || []).length / Math.max(subject.length, 1);
  
  if (allCapsRatio > 0.5 && subject.length > 10) {
    spamScore += 15;
    detectedIssues.push("all_caps_subject");
    recommendations.push("Avoid using ALL CAPS in subject lines");
  }

  // Check exclamation spam
  const exclamationCount = (subject.match(/!/g) || []).length;
  if (exclamationCount > 2) {
    spamScore += 10;
    detectedIssues.push("exclamation_spam");
    recommendations.push("Reduce exclamation marks in subject line");
  }

  // Check for spam phrases
  for (const phrase of spamPhrases) {
    if (combinedText.includes(phrase.toLowerCase())) {
      spamScore += 5;
      flaggedKeywords.push(phrase);
    }
  }

  // Check for phishing phrases
  for (const phrase of phishingPhrases) {
    if (combinedText.includes(phrase.toLowerCase())) {
      spamScore += 20;
      detectedIssues.push("phishing_like_phrases");
      flaggedKeywords.push(phrase);
      recommendations.push("Avoid phrases that look like phishing attempts");
    }
  }

  // Count links
  const linkMatches = body.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi);
  const linkCount = linkMatches ? linkMatches.length : 0;
  
  if (linkCount > 5) {
    spamScore += 10;
    detectedIssues.push("too_many_links");
    recommendations.push("Reduce number of links (recommended: 1-2 links)");
  }

  // Count images
  const imageMatches = body.match(/<img[^>]+>/gi);
  const imageCount = imageMatches ? imageMatches.length : 0;

  // Check for hidden text (white on white, tiny font)
  if (body.includes("font-size:1px") || body.includes("color:#ffffff") || body.includes("color:white")) {
    spamScore += 25;
    detectedIssues.push("hidden_text");
    recommendations.push("Remove hidden text from email");
  }

  // Check keyword ratio
  const wordCount = body.split(/\s+/).length;
  const keywordDensity = flaggedKeywords.length / Math.max(wordCount / 100, 1);
  if (keywordDensity > 2) {
    spamScore += 15;
    detectedIssues.push("high_keyword_density");
    recommendations.push("Reduce spam keyword usage");
  }

  // Check body length
  if (body.length < 50) {
    spamScore += 10;
    detectedIssues.push("too_short");
    recommendations.push("Email body is too short (minimum recommended: 100 characters)");
  }

  // Determine risk level
  let riskLevel: "low" | "medium" | "high" | "critical";
  if (spamScore >= 50) {
    riskLevel = "critical";
  } else if (spamScore >= 30) {
    riskLevel = "high";
  } else if (spamScore >= 15) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // Cap spam score at 100
  spamScore = Math.min(100, spamScore);

  return {
    spam_score: spamScore,
    risk_level: riskLevel,
    detected_issues: [...new Set(detectedIssues)],
    flagged_keywords: [...new Set(flaggedKeywords)],
    link_count: linkCount,
    image_count: imageCount,
    recommendations: [...new Set(recommendations)],
  };
}





















































