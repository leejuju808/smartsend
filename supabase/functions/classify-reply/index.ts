import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const DEFAULT_OOO_DAYS = Number(Deno.env.get("DEFAULT_OOO_BUSINESS_DAYS") ?? "3");
const STRONG_MODEL = Deno.env.get("STRONG_MODEL") ?? "gpt-4o";
const LOW_CONF_DEFAULT = 0.72;

// Block 8470 — Plan gating helpers
type PlanName = "free" | "pro" | "enterprise" | "unknown";

function normalizePlan(plan?: string | null, status?: string | null): {
  plan: PlanName;
  status: string;
} {
  const rawPlan = (plan ?? "free").toLowerCase() as PlanName;
  const rawStatus = (status ?? "inactive").toLowerCase();

  if (rawPlan === "pro" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "pro", status: rawStatus };
  }
  if (rawPlan === "enterprise" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "enterprise", status: rawStatus };
  }
  if (rawPlan === "free") {
    return { plan: "free", status: rawStatus };
  }
  return { plan: "unknown", status: rawStatus };
}

function hasProAI(planInfo: { plan: PlanName; status: string }): boolean {
  return planInfo.plan === "pro" || planInfo.plan === "enterprise";
}

serve(async (req) => {
  try {
    const { thread_id, body_text, hints } = await req.json();

    const { data: threadCtx, error: threadFetchError } = await supabase
      .from("inbox_threads")
      .select(
        "id, lead_id, campaign_id, ai_return_date, is_suppressed, campaigns!inner(cls_conf_threshold, owner_user_id, owner_id, user_id)",
      )
      .eq("id", thread_id)
      .single();
    if (threadFetchError) throw threadFetchError;

    const threshold = threadCtx?.campaigns?.cls_conf_threshold ?? LOW_CONF_DEFAULT;

    // Block 8470 — Plan gating: Check if user has Pro AI access
    const campaignId = threadCtx?.campaign_id;
    if (campaignId) {
      const ownerUserId = threadCtx?.campaigns?.owner_user_id ?? 
                          threadCtx?.campaigns?.owner_id ?? 
                          threadCtx?.campaigns?.user_id;

      if (ownerUserId) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("plan, plan_status")
          .eq("id", ownerUserId)
          .single();

        if (!profileError && profile) {
          const planInfo = normalizePlan(profile.plan, profile.plan_status);
          const proAI = hasProAI(planInfo);

          if (!proAI) {
            console.log("AI classify-reply blocked for non-Pro user", planInfo);
            // Still update thread with basic info but skip AI classification
            await supabase
              .from("inbox_threads")
              .update({
                ai_intent: null,
                ai_confidence: null,
                ai_classified_at: new Date().toISOString(),
                last_classify_err: "AI reply classification is only available on Pro plans.",
              })
              .eq("id", thread_id);

            return new Response(
              JSON.stringify({ 
                error: "AI reply classification is only available on Pro plans.",
                blocked: true 
              }),
              { 
                status: 402,
                headers: { "content-type": "application/json" },
              },
            );
          }
        }
      }
    }
    const cleanBody = body_text ?? "";
    const kwUnsub =
      hints?.keyword_unsubscribe === true ||
      /unsubscribe|remove me|opt-?out|do not contact|stop emailing/i.test(cleanBody);
    const kwOOO =
      hints?.keyword_ooo === true ||
      /out of office|on vacation|away until|return(ing)? on/i.test(cleanBody);

    const prompt = `
Classify this email reply and (if out_of_office) extract a return date if present.
Return JSON: { "intent": "...", "confidence": 0-1, "return_date": "YYYY-MM-DD|null" }.
Email:
${cleanBody}`;

    const primary = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an email intent classifier." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const parsedPrimary = JSON.parse(primary.choices?.[0]?.message?.content ?? "{}");
    let intent = parsedPrimary.intent ?? "unknown";
    let confidence = Number(parsedPrimary.confidence ?? 0.5);

    if (Number.isNaN(confidence)) confidence = 0.5;

    let returnDateStr: string | null = null;
    const rawReturnDate = parsedPrimary.return_date;
    if (typeof rawReturnDate === "string") {
      const trimmed = rawReturnDate.trim();
      if (trimmed && trimmed.toLowerCase() !== "null") {
        returnDateStr = trimmed;
      }
    } else if (rawReturnDate instanceof Date) {
      returnDateStr = rawReturnDate.toISOString().slice(0, 10);
    } else if (rawReturnDate && typeof rawReturnDate === "object" && "date" in rawReturnDate) {
      const maybeDate = (rawReturnDate as Record<string, string>).date;
      if (maybeDate) {
        returnDateStr = maybeDate;
      }
    } else if (typeof rawReturnDate === "number") {
      const maybeDate = new Date(rawReturnDate);
      if (!isNaN(maybeDate.getTime())) {
        returnDateStr = maybeDate.toISOString().slice(0, 10);
      }
    }

    if (kwUnsub && confidence < 0.9) {
      intent = "unsubscribe";
      confidence = Math.max(confidence, 0.91);
    }
    if (kwOOO && confidence < 0.85) {
      intent = "out_of_office";
      confidence = Math.max(confidence, 0.86);
    }

    let usedModel = "gpt-4o-mini";

    if (confidence < threshold) {
      const backup = await openai.chat.completions.create({
        model: STRONG_MODEL,
        messages: [
          { role: "system", content: "You are an email intent classifier. Be decisive." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });
      const parsedBackup = JSON.parse(backup.choices?.[0]?.message?.content ?? "{}");
      const backupIntent = parsedBackup.intent ?? intent;
      const backupConfidence = Number(parsedBackup.confidence ?? confidence);
      if (!Number.isNaN(backupConfidence) && backupConfidence > confidence) {
        intent = backupIntent;
        confidence = backupConfidence;
        usedModel = STRONG_MODEL;
        const backupReturn = parsedBackup.return_date;
        if (typeof backupReturn === "string") {
          const trimmed = backupReturn.trim();
          if (trimmed && trimmed.toLowerCase() !== "null") {
            returnDateStr = trimmed;
          }
        }
      }
    }

    const nowIso = new Date().toISOString();
    const needsReview = confidence < threshold;

    // Block 20030 — Apply Engagement Scoring
    const replyText = cleanBody || "";
    let engagementScore = 0;
    const textLower = replyText.toLowerCase();

    // Positive signals (increase score)
    if (/estimate|quote|inspection/i.test(textLower)) engagementScore += 50;
    if (/urgent|leak|storm|hail|damage/i.test(textLower)) engagementScore += 30;
    if (/price|cost|how much/i.test(textLower)) engagementScore += 10;
    if (/when|available|schedule|appointment/i.test(textLower)) engagementScore += 15;
    if (/yes|interested|sounds good|let's do/i.test(textLower)) engagementScore += 20;
    if (/insurance|claim|adjuster/i.test(textLower)) engagementScore += 25;

    // Negative signals (decrease score)
    if (/not now|maybe later|not interested/i.test(textLower)) engagementScore -= 10;
    if (/stop|remove|unsubscribe|opt out/i.test(textLower)) engagementScore -= 999;
    if (/spam|junk|delete/i.test(textLower)) engagementScore -= 50;

    // Determine engagement level
    let engagementLevel: "cold" | "warm" | "hot" | null = null;
    if (engagementScore >= 40) {
      engagementLevel = "hot";
    } else if (engagementScore >= 10) {
      engagementLevel = "warm";
    } else if (engagementScore >= 0) {
      engagementLevel = "cold";
    }

    // Ensure score doesn't go negative (except for unsubscribe)
    if (engagementScore < 0 && engagementScore > -999) {
      engagementScore = 0;
    }

    // Generate behavior notes
    const tone = /urgent|asap|leak|emergency/i.test(textLower)
      ? "Urgent"
      : /thank|appreciate|great/i.test(textLower)
      ? "Positive"
      : "Normal";

    let intentNote = "Unclear, follow-up needed.";
    if (/estimate|quote/i.test(textLower)) {
      intentNote = "Wants pricing.";
    } else if (/info|details|tell me more/i.test(textLower)) {
      intentNote = "Seeking info.";
    } else if (/schedule|appointment|when/i.test(textLower)) {
      intentNote = "Wants to schedule.";
    } else if (/insurance|claim/i.test(textLower)) {
      intentNote = "Insurance-related inquiry.";
    }

    const risk = /storm|hail|leak|damage|urgent/i.test(textLower)
      ? "Potential claim job."
      : "Low";

    const behaviorNotes = `• Tone: ${tone}
• Intent: ${intentNote}
• Risk: ${risk}`;

    const { data: updatedThread, error: updateError } = await supabase
      .from("inbox_threads")
      .update({
        ai_intent: intent,
        ai_confidence: confidence,
        ai_classified_at: nowIso,
        ai_return_date: returnDateStr ?? null,
        last_classified_at: nowIso,
        needs_review: needsReview,
        last_classify_err: null,
        // Block 20030 — Engagement scoring fields
        engagement_score: engagementScore,
        engagement_level: engagementLevel,
        behavior_notes: behaviorNotes,
      })
      .eq("id", thread_id)
      .select("id, ai_return_date, lead_id, campaign_id")
      .single();
    if (updateError) throw updateError;

    // Block 20030 — Trigger property intelligence builder (fire-and-forget)
    if (updatedThread?.campaign_id) {
      // Get homeowner email from contact or message
      const { data: contact } = await supabase
        .from("contacts")
        .select("email")
        .eq("id", threadCtx?.contact_id || "")
        .maybeSingle()
        .catch(() => null);

      const homeownerEmail = contact?.email || null;

      // Call property intelligence builder asynchronously
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/property-intel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          thread_id,
          homeowner_email: homeownerEmail,
        }),
      }).catch((err) => {
        console.error("Property intel call failed (non-blocking):", err);
      });
    }

    const { error: logError } = await supabase.from("ai_reply_classifications").insert({
      thread_id,
      message_id: null,
      model: usedModel,
      ai_intent: intent,
      ai_confidence: confidence,
      meta: {
        source: "edge",
        body_chars: cleanBody.length,
        kwUnsub: !!kwUnsub,
        kwOOO: !!kwOOO,
      },
    });
    if (logError) {
      console.error("Failed to log ai_reply_classifications entry", logError);
    }

    if (needsReview) {
      await supabase.rpc("enqueue_review", {
        p_thread_id: thread_id,
        p_reason: "low_confidence",
        p_note: `th=${threshold}`,
      });

      if (intent === "unsubscribe") {
        await supabase.rpc("suppress_lead_from_thread", { p_thread_id: thread_id });
        await supabase.rpc("pause_lead_followups", {
          p_thread_id: thread_id,
          p_reason: "unsubscribe",
        });
      }

      return new Response(
        JSON.stringify({ success: true, intent, confidence, needs_review: true }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (intent === "unsubscribe" && updatedThread?.lead_id) {
      const { error: suppressErr } = await supabase.rpc("suppress_lead", {
        p_lead_id: updatedThread.lead_id,
        p_reason: "unsubscribe",
        p_scope: "account",
        p_campaign_id: updatedThread.campaign_id,
        p_source: "inbound",
      });
      if (suppressErr) throw suppressErr;

      const { error: markErr } = await supabase
        .from("inbox_threads")
        .update({
          is_suppressed: true,
          suppressed_at: new Date().toISOString(),
          suppressed_reason: "unsubscribe",
        })
        .eq("id", thread_id);
      if (markErr) throw markErr;

      const { error: pauseErr } = await supabase.rpc("pause_lead_followups", {
        p_thread_id: thread_id,
        p_reason: "unsubscribe",
      });
      if (pauseErr) throw pauseErr;
    } else if (["positive", "question", "out_of_office"].includes(intent)) {
      if (intent === "out_of_office") {
        let until: string | null = null;

        const dateSource = returnDateStr ?? updatedThread?.ai_return_date ?? threadCtx?.ai_return_date;
        if (dateSource) {
          const resumeDate = new Date(`${dateSource}T08:00:00Z`);
          resumeDate.setUTCDate(resumeDate.getUTCDate() + 1);
          until = resumeDate.toISOString();
        } else {
          const { data: fallback, error: rpcError } = await supabase.rpc("add_business_days", {
            p_start: nowIso,
            p_days: DEFAULT_OOO_DAYS,
          });
          if (rpcError) throw rpcError;
          until = (fallback as string | null) ?? null;
        }

        const { error: pauseError } = await supabase.rpc("pause_lead_followups", {
          p_thread_id: thread_id,
          p_reason: "ooo",
          p_until: until,
        });
        if (pauseError) throw pauseError;

        const { error: scheduleError } = await supabase.rpc("schedule_ooo_autonudge", {
          p_thread_id: thread_id,
        });
        if (scheduleError) throw scheduleError;
      } else {
        const { error: pauseError } = await supabase.rpc("pause_lead_followups", {
          p_thread_id: thread_id,
          p_reason: "replied",
        });
        if (pauseError) throw pauseError;
      }
    }

    return new Response(
      JSON.stringify({ success: true, intent, confidence, needs_review: false }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  } catch (e) {
    console.error(e);
    await supabase.from("system_logs").insert({
      category: "classifier",
      level: "error",
      message: "edge failure",
      meta: { err: String(e) },
    });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
});

