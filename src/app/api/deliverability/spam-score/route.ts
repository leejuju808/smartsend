// Block 76000 — Spam Score Scanner
// Analyzes email content for spam indicators

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

interface SpamScoreResult {
  score: number; // 0-100, lower is better
  grade: "excellent" | "good" | "fair" | "poor" | "critical";
  issues: Array<{
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    suggestion?: string;
  }>;
  details: {
    spammyWords: number;
    linkCount: number;
    textToImageRatio: number;
    htmlComplexity: number;
    signatureLength: number;
  };
}

// Common spam trigger words
const SPAM_WORDS = [
  "free", "click here", "act now", "limited time", "urgent", "guarantee",
  "winner", "congratulations", "cash", "prize", "deal", "discount",
  "save", "offer", "buy now", "order now", "call now", "click below",
  "risk-free", "no obligation", "exclusive", "once in a lifetime",
  "act immediately", "don't delete", "this won't last", "expires",
  "opt-out", "unsubscribe", "remove", "no thanks", "not interested",
];

function calculateSpamScore(subject: string, body: string, bodyHtml?: string): SpamScoreResult {
  const issues: SpamScoreResult["issues"] = [];
  let score = 0;

  // 1. Check for spammy words
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const combinedText = `${subjectLower} ${bodyLower}`;
  
  let spammyWordCount = 0;
  for (const word of SPAM_WORDS) {
    if (combinedText.includes(word)) {
      spammyWordCount++;
      const severity = word.includes("free") || word.includes("click here") ? "high" : "medium";
      issues.push({
        type: "spammy_word",
        severity,
        message: `Contains spam trigger word: "${word}"`,
        suggestion: "Consider rephrasing to sound more natural",
      });
    }
  }

  // 2. Check link count
  const linkRegex = /https?:\/\/[^\s]+/g;
  const links = body.match(linkRegex) || [];
  const linkCount = links.length;
  
  if (linkCount > 3) {
    score += 10;
    issues.push({
      type: "too_many_links",
      severity: "medium",
      message: `Email contains ${linkCount} links (recommended: 1-2)`,
      suggestion: "Reduce the number of links to improve deliverability",
    });
  }

  // 3. Check text-to-image ratio (if HTML provided)
  let textToImageRatio = 1;
  if (bodyHtml) {
    const textLength = body.replace(/<[^>]+>/g, "").length;
    const imageCount = (bodyHtml.match(/<img[^>]+>/g) || []).length;
    textToImageRatio = imageCount > 0 ? textLength / imageCount : textLength;
    
    if (imageCount > 0 && textLength < 100) {
      score += 15;
      issues.push({
        type: "image_heavy",
        severity: "high",
        message: "Email is mostly images with little text",
        suggestion: "Add more text content and use alt text for images",
      });
    }
  }

  // 4. Check HTML complexity
  let htmlComplexity = 0;
  if (bodyHtml) {
    const tagCount = (bodyHtml.match(/<[^>]+>/g) || []).length;
    const styleCount = (bodyHtml.match(/style=["'][^"']*["']/g) || []).length;
    htmlComplexity = tagCount + styleCount;
    
    if (htmlComplexity > 50) {
      score += 5;
      issues.push({
        type: "complex_html",
        severity: "low",
        message: "Email has complex HTML structure",
        suggestion: "Simplify HTML for better deliverability",
      });
    }
  }

  // 5. Check signature length
  const signatureRegex = /(--|Best|Regards|Sincerely)[\s\S]{0,200}$/i;
  const signatureMatch = body.match(signatureRegex);
  const signatureLength = signatureMatch ? signatureMatch[0].length : 0;
  
  if (signatureLength > 500) {
    score += 5;
    issues.push({
      type: "long_signature",
      severity: "low",
      message: "Email signature is very long",
      suggestion: "Keep signature concise",
    });
  }

  // 6. Check subject line
  if (subject.length > 50) {
    score += 5;
    issues.push({
      type: "long_subject",
      severity: "low",
      message: `Subject line is ${subject.length} characters (recommended: <50)`,
      suggestion: "Shorten subject line",
    });
  }

  if (subject.length < 10) {
    score += 10;
    issues.push({
      type: "short_subject",
      severity: "medium",
      message: "Subject line is very short",
      suggestion: "Add more descriptive subject",
    });
  }

  // 7. Check for excessive capitalization
  const capsRatio = (subject.match(/[A-Z]/g) || []).length / subject.length;
  if (capsRatio > 0.5) {
    score += 15;
    issues.push({
      type: "excessive_caps",
      severity: "high",
      message: "Subject line has excessive capitalization",
      suggestion: "Use normal capitalization",
    });
  }

  // 8. Check for special characters
  const specialCharCount = (subject.match(/[!$#%&*]/g) || []).length;
  if (specialCharCount > 2) {
    score += 10;
    issues.push({
      type: "special_characters",
      severity: "medium",
      message: "Subject line has many special characters",
      suggestion: "Reduce special characters",
    });
  }

  // Calculate final score
  score += spammyWordCount * 5;
  score = Math.min(100, Math.max(0, score));

  // Determine grade
  let grade: SpamScoreResult["grade"];
  if (score < 20) {
    grade = "excellent";
  } else if (score < 40) {
    grade = "good";
  } else if (score < 60) {
    grade = "fair";
  } else if (score < 80) {
    grade = "poor";
  } else {
    grade = "critical";
  }

  return {
    score,
    grade,
    issues,
    details: {
      spammyWords: spammyWordCount,
      linkCount,
      textToImageRatio,
      htmlComplexity,
      signatureLength,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { subject, body: emailBody, body_html } = body;

    if (!subject || !emailBody) {
      return NextResponse.json(
        { error: "subject and body are required" },
        { status: 400 }
      );
    }

    const result = calculateSpamScore(subject, emailBody, body_html);

    return NextResponse.json({
      success: true,
      ...result,
      message: result.grade === "excellent" 
        ? "This email is clean and inbox-ready."
        : `This email has a ${result.grade} spam score. Consider addressing the issues below.`,
    });
  } catch (error: any) {
    console.error("Spam score error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate spam score" },
      { status: 500 }
    );
  }
}



























