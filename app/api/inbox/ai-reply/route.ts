// Block 20110 — AI Smart Reply Draft
// One-click AI reply generation for roofing inbox

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";

function formatCurrencyRange(min: number, max: number) {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  return `${fmt(min)}–${fmt(max)}`;
}

function inferTypicalRange(args: {
  homeownerText: string;
  isClaim: boolean;
  estimatedJobValue?: number | null;
}): { min: number; max: number } {
  const { homeownerText, isClaim, estimatedJobValue } = args;
  const text = (homeownerText || "").toLowerCase();

  // If we have a value signal, turn it into a conservative band.
  if (typeof estimatedJobValue === "number" && Number.isFinite(estimatedJobValue) && estimatedJobValue > 0) {
    const v = Math.max(500, estimatedJobValue);
    const min = Math.max(250, v * 0.7);
    const max = Math.max(min, v * 1.3);
    // Clamp to sane bounds
    return { min: Math.min(min, 100000), max: Math.min(max, 120000) };
  }

  // Otherwise, heuristic by language + claim signal.
  if (isClaim) return { min: 10000, max: 30000 };

  if (text.match(/(replace|replacement|reroof|new roof|full roof)/)) return { min: 12000, max: 25000 };
  if (text.match(/(leak|leaking|repair|patch|missing shingle|shingles)/)) return { min: 800, max: 6000 };
  if (text.match(/(gutter|downspout)/)) return { min: 1500, max: 4000 };

  // Default "context" band
  return { min: 5000, max: 15000 };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      conversation_id,
      // Back-compat for older callers (InboxThreadDrawer)
      leadId,
      campaignId,
      lastInboundSubject,
      lastInboundBody,
    } = body as any;

    if (!conversation_id && !(leadId && campaignId && lastInboundBody)) {
      return NextResponse.json(
        { error: "conversation_id or (leadId, campaignId, lastInboundBody) required" },
        { status: 400 }
      );
    }

    // Load context in one of two ways:
    // A) conversation_id (Owner Inbox v2 / pipeline)
    // B) leadId+campaignId+lastInboundBody (legacy drawer)
    let homeownerText = String(lastInboundBody || "").trim();
    let homeownerName: string | null = null;
    let homeownerEmail: string | null = null;
    let propertyAddress: string | null = null;
    let isClaim = false;
    let roofAgeEstimated: number | null = null;
    let stage = "new";
    let workspaceId: string | null = null;
    let typicalRangeLine: string | null = null;
    let estimatedJobValueForRange: number | null = null;

    if (conversation_id) {
      // 1) Load conversation + basic intel (and workspace via campaign)
      const { data: convo, error: convoError } = await supabase
        .from("inbox_threads")
        .select(
          `
          id,
          homeowner_name,
          homeowner_email,
          property_address,
          roof_age_estimated,
          is_insurance_claim,
          has_insurance_claim,
          engagement_level,
          lead_stage,
          thread_estimated_value,
          estimated_job_value,
          contacts:contact_id (
            email,
            first_name,
            last_name
          ),
          campaigns:campaign_id (
            workspace_id
          )
        `
        )
        .eq("id", conversation_id)
        .single();

      if (convoError || !convo) {
        console.error("AI reply convo error", convoError);
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }

      const contact = (convo as any).contacts as any;
      homeownerName =
        (convo as any).homeowner_name ||
        (contact
          ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() ||
            contact.email?.split("@")[0]
          : null);
      homeownerEmail = (convo as any).homeowner_email || contact?.email || null;

      propertyAddress = (convo as any).property_address || null;
      roofAgeEstimated = (convo as any).roof_age_estimated ?? null;
      isClaim = Boolean((convo as any).is_insurance_claim || (convo as any).has_insurance_claim);
      stage = String((convo as any).lead_stage || "new");
      estimatedJobValueForRange =
        (convo as any).estimated_job_value ??
        (convo as any).thread_estimated_value ??
        (convo as any).estimated_job_value ??
        null;

      const camp = (convo as any).campaigns as any;
      workspaceId = camp?.workspace_id ? String(camp.workspace_id) : null;

      // 2) Get last inbound homeowner message if caller didn't provide it
      if (!homeownerText) {
        const { data: messages, error: msgError } = await supabase
          .from("inbox_messages")
          .select("id, direction, body_raw, body_clean, body_html, body_text, created_at, received_at")
          .eq("thread_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (msgError) {
          console.error("AI reply messages error", msgError);
          return NextResponse.json(
            { error: "Failed to load messages" },
            { status: 500 }
          );
        }

        const lastInbound = (messages || []).find(
          (m: any) =>
            m.direction === "inbound" ||
            m.direction === "in" ||
            (m.direction !== "outbound" && m.direction !== "out")
        );

        if (!lastInbound) {
          return NextResponse.json(
            { error: "No homeowner message found for this conversation" },
            { status: 400 }
          );
        }

        homeownerText =
          lastInbound.body_clean ||
          lastInbound.body_text ||
          lastInbound.body_raw ||
          lastInbound.body_html?.replace(/<[^>]*>/g, "") ||
          "";
        homeownerText = String(homeownerText || "").trim();
      }
    } else {
      // Legacy path: infer basics from lead + campaign
      const { data: lead } = await supabase
        .from("leads")
        .select("id, email, first_name, last_name, address, city, state")
        .eq("id", leadId)
        .maybeSingle();

      homeownerName =
        lead
          ? `${(lead as any).first_name || ""} ${(lead as any).last_name || ""}`.trim() ||
            (lead as any).email?.split("@")?.[0] ||
            null
          : null;
      homeownerEmail = (lead as any)?.email || null;
      propertyAddress = (lead as any)?.address || null;

      const { data: camp } = await supabase
        .from("campaigns")
        .select("id, workspace_id")
        .eq("id", campaignId)
        .maybeSingle();
      workspaceId = (camp as any)?.workspace_id ? String((camp as any).workspace_id) : null;

      // Subject/body provided by caller
      homeownerText = String(lastInboundBody || "").trim();
    }

    if (!homeownerText.trim()) {
      return NextResponse.json(
        { error: "Homeowner message has no text content" },
        { status: 400 }
      );
    }

    // 3) Availability windows (best-effort)
    type Suggestion = {
      suggested_start_time: string;
      suggested_end_time: string;
      confidence_score?: number;
      suggestion_reason?: string;
    };

    let availabilityLine: string | null = null;
    let calendarTight = false;

    if (workspaceId) {
      try {
        const { data: suggestions } = await supabase.rpc("generate_smart_time_suggestions", {
          p_workspace_id: workspaceId,
          p_thread_id: conversation_id || null,
          p_contact_id: null,
          p_job_type: null,
          p_severity: null,
          p_urgency: null,
          p_location_zip: null,
        });

        const slots = (suggestions || []) as Suggestion[];
        const top = slots.slice(0, 2).filter((s) => s?.suggested_start_time);

        if (top.length > 0) {
          const fmt = (iso: string) => {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return null;
            const date = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
            const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            return `${date} at ${time}`;
          };

          const a = fmt(top[0].suggested_start_time);
          const b = top[1]?.suggested_start_time ? fmt(top[1].suggested_start_time) : null;

          const parts = [a, b].filter(Boolean) as string[];
          if (parts.length > 0) {
            availabilityLine = `Next openings (from our schedule): ${parts.join(" or ")}.`;

            const earliest = new Date(top[0].suggested_start_time).getTime();
            const hoursOut = (earliest - Date.now()) / (1000 * 60 * 60);
            calendarTight = Number.isFinite(hoursOut) ? hoursOut >= 72 : false;
          }
        }
      } catch {
        // ignore — we'll fall back to generic pacing
      }
    }

    // 3) Build prompt context
    const claimInfo = isClaim
      ? "This looks like an INSURANCE CLAIM job. Mention that you can help with documentation and talking to their adjuster, but do NOT promise claim approval."
      : "This does NOT look like an insurance claim job. Just focus on inspection + estimate.";

    const name = homeownerName || "the homeowner";
    const address = propertyAddress || "their property";

    const roofAge = roofAgeEstimated
      ? `Estimated roof age: ${roofAgeEstimated} years.`
      : "Roof age unknown.";

    // Block 270900 — Price-First Framing (Silent)
    // Compute once we have homeownerText, claim signal, and (optional) value signal.
    // This is "context", not a quote.
    try {
      const typical = inferTypicalRange({
        homeownerText,
        isClaim,
        estimatedJobValue: estimatedJobValueForRange,
      });
      typicalRangeLine = `Typical projects in your area run ${formatCurrencyRange(typical.min, typical.max)} depending on size and scope.`;
    } catch {
      typicalRangeLine = null;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are an assistant writing email replies for a local roofing company.
Write clear, friendly, professional replies that a real roofer would send.

Rules:
- 6th–8th grade reading level.
- Short paragraphs, no big walls of text.
- Always move toward a FREE INSPECTION or ESTIMATE.
- If they mention leaks, active interior water, storms, hail, or missing shingles, treat it as urgent (same-day if possible).
- If they seem price-only, invite them to a quick inspection so you can give a real number.
- No emojis, no slang, no AI talk.
- Keep it under 180 words.
- Never sound desperate. Never use urgency-for-urgency language (avoid: "ASAP", "right away", "immediately") unless it's a true emergency leak.
- Default pacing: assume you're booked and offer next available windows (not "whenever").
- Do NOT offer discounts or price cuts. Keep pricing confident and matter-of-fact.

${typicalRangeLine ? `Block 270900 (Price-First Framing — Silent):
- Early in the reply, naturally include ONE sentence of price context:
  "${typicalRangeLine}"
- This is NOT a quote. Do not call it a quote, estimate, or guarantee.
` : ""}

${claimInfo}

Context:
- Homeowner name: ${name}
- Property: ${address}
- ${roofAge}
- Lead stage: ${stage}
${availabilityLine ? `- ${availabilityLine}` : `- Scheduling: Offer 2 next available windows (e.g. "early next week" and "mid-week").`}
- Calendar tightness: ${calendarTight ? "TIGHT (use 'next opening' language, no rush)" : "NORMAL (still no rush language)"}
          `.trim(),
        },
        {
          role: "user",
          content: `
This is the latest message from the homeowner. Write an email reply in the roofer's voice.

Homeowner message:

"""
${homeownerText}
"""

Only output the email body. Start with "Hi [Name]" (or "Hi there" if no name).
          `.trim(),
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const draft =
      completion.choices[0]?.message?.content?.trim() ||
      "Hi there,\n\nThanks for reaching out. I'd be happy to help with your roofing needs.\n\nWould you like me to come out for a free inspection?\n\nBest,\n[Your Roofing Company]";

    return NextResponse.json({ draft });
  } catch (error: any) {
    console.error("AI reply generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate AI reply" },
      { status: 500 }
    );
  }
}
