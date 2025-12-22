// Block 21140 — SmartSend Proposal Follow-Up Brain v2
// AI-Powered Follow-Up Message Generator
// Generates personalized follow-up messages based on behavior, insurance status, and timing

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

interface FollowUpRequest {
  proposal_id: string;
  followup_type?: string;
  tone?: string;
}

interface FollowUpMessage {
  subject: string;
  body: string;
  body_html?: string;
  followup_type: string;
  tone: string;
}

Deno.serve(async (req) => {
  try {
    const { proposal_id, followup_type, tone }: FollowUpRequest = await req.json();

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: "proposal_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get proposal and related data
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(`
        *,
        thread:inbox_threads(
          id,
          contact_email,
          insurance_claim_status,
          insurance_carrier,
          insurance_deductible_amount,
          install_ready_score,
          install_ready_status,
          has_parsed_scope
        ),
        contact:contacts(
          id,
          name,
          email,
          first_name,
          last_name
        )
      `)
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const thread = proposal.thread as any;
    const contact = proposal.contact as any;

    // Get proposal analytics
    const analytics = proposal.proposal_analytics || {};
    const viewCount = analytics.view_count || 0;
    const lastViewedAt = analytics.last_viewed_at;
    const viewedOnPhone = analytics.viewed_on_phone || false;
    const forwardedToSpouse = analytics.forwarded_to_spouse || false;

    // Determine follow-up type if not provided
    const finalFollowupType = followup_type || await determineFollowupType(
      proposal_id,
      thread,
      analytics
    );

    // Determine tone if not provided
    const finalTone = tone || "friendly";

    // Generate follow-up message
    const message = await generateFollowUpMessage({
      proposal,
      thread,
      contact,
      analytics,
      followup_type: finalFollowupType,
      tone: finalTone,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message,
        followup_type: finalFollowupType,
        tone: finalTone,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating follow-up:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function determineFollowupType(
  proposalId: string,
  thread: any,
  analytics: any
): Promise<string> {
  // Check for price objection
  const { data: priceObjection } = await supabase
    .from("reply_classifications")
    .select("id")
    .eq("thread_id", thread.id)
    .eq("classification_category", "price_concern_objection")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();

  if (priceObjection) {
    return "price_objection";
  }

  // Check insurance status
  if (thread.insurance_claim_status === "approved" || 
      thread.insurance_claim_status === "pending_approval") {
    return "insurance_aware";
  }

  // Check install-ready score
  if (thread.install_ready_score >= 70) {
    return "closing_push";
  }

  // Check view behavior
  const viewCount = analytics.view_count || 0;
  if (viewCount >= 2) {
    return "urgency_based";
  }

  // Default
  return "soft_friendly";
}

async function generateFollowUpMessage(params: {
  proposal: any;
  thread: any;
  contact: any;
  analytics: any;
  followup_type: string;
  tone: string;
}): Promise<FollowUpMessage> {
  const { proposal, thread, contact, analytics, followup_type, tone } = params;

  const homeownerName = contact?.first_name || contact?.name || "there";
  const proposalPrice = proposal.proposal_data?.project_price || "the proposal";
  const insuranceCarrier = thread.insurance_carrier || "your insurance";
  const deductible = thread.insurance_deductible_amount;
  const installReadyScore = thread.install_ready_score;
  const viewCount = analytics.view_count || 0;
  const lastViewedAt = analytics.last_viewed_at;

  // Build context for AI
  let contextPrompt = "";
  let messageTypeDescription = "";

  switch (followup_type) {
    case "soft_friendly":
      messageTypeDescription = "a soft, friendly follow-up checking in to see if they have questions";
      contextPrompt = `The homeowner opened the proposal ${viewCount} time(s). Send a friendly check-in message.`;
      break;

    case "urgency_based":
      messageTypeDescription = "an urgency-based follow-up because they've viewed the proposal multiple times";
      contextPrompt = `The homeowner has viewed the proposal ${viewCount} times, indicating high interest. Create an urgency-based message offering to schedule.`;
      break;

    case "insurance_aware":
      messageTypeDescription = "an insurance-aware follow-up that addresses their claim status";
      contextPrompt = `Their insurance claim status is: ${thread.insurance_claim_status}. ${deductible ? `Their deductible is $${deductible}.` : "Deductible is unknown."} Create a message that helps them understand next steps with their insurance claim.`;
      break;

    case "price_objection":
      messageTypeDescription = "a price-objection follow-up that addresses cost concerns";
      contextPrompt = `The homeowner has expressed price concerns. Create a reassuring message explaining that their insurance approved this scope, so their out-of-pocket won't change.`;
      break;

    case "closing_push":
      messageTypeDescription = "a closing push message because they're install-ready";
      contextPrompt = `Install-ready score is ${installReadyScore} (ready to schedule). Create a strong closing message offering to lock in their install date.`;
      break;

    case "deadline_based":
      messageTypeDescription = "a deadline-based follow-up about weather/season timing";
      contextPrompt = `Create a message about scheduling before weather changes or season ends.`;
      break;

    default:
      messageTypeDescription = "a friendly follow-up";
      contextPrompt = `Send a friendly follow-up message.`;
  }

  // Build AI prompt
  const systemPrompt = `You are SmartSend's AI Follow-Up Writer for roofing companies. Generate personalized follow-up emails that sound like a real roofer wrote them.

Rules:
- 6th-8th grade reading level
- Short paragraphs, conversational tone
- No emojis, no AI talk, no corporate jargon
- Keep it under 150 words
- Always move toward scheduling or answering questions
- Sound like a friendly local roofer, not a sales bot
- Use the homeowner's first name naturally`;

  const userPrompt = `Generate ${messageTypeDescription} for ${homeownerName}.

Context:
- Proposal price: $${proposalPrice}
- Insurance carrier: ${insuranceCarrier}
${deductible ? `- Deductible: $${deductible}` : ""}
${installReadyScore ? `- Install-ready score: ${installReadyScore}/100` : ""}
- Proposal viewed ${viewCount} time(s)
${lastViewedAt ? `- Last viewed: ${new Date(lastViewedAt).toLocaleDateString()}` : ""}

Tone: ${tone}

${contextPrompt}

Write a subject line and email body. Return JSON:
{
  "subject": "Subject line here",
  "body": "Email body in plain text (will be converted to HTML)",
  "body_html": "Email body in HTML format"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("No content from OpenAI");
    }

    // Parse JSON (handle markdown code blocks if present)
    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", parseError, content);
      // Fallback to default message
      return generateFallbackMessage(homeownerName, followup_type, tone);
    }

    return {
      subject: parsed.subject || `Re: Your Roof Proposal`,
      body: parsed.body || generateFallbackBody(homeownerName, followup_type),
      body_html: parsed.body_html || convertToHtml(parsed.body || generateFallbackBody(homeownerName, followup_type)),
      followup_type,
      tone,
    };
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    return generateFallbackMessage(homeownerName, followup_type, tone);
  }
}

function generateFallbackMessage(
  homeownerName: string,
  followupType: string,
  tone: string
): FollowUpMessage {
  return {
    subject: `Re: Your Roof Proposal`,
    body: generateFallbackBody(homeownerName, followupType),
    body_html: convertToHtml(generateFallbackBody(homeownerName, followupType)),
    followup_type: followupType,
    tone,
  };
}

function generateFallbackBody(homeownerName: string, followupType: string): string {
  switch (followupType) {
    case "soft_friendly":
      return `Hey ${homeownerName}, just checking in to see if you had any questions about the proposal.\n\nLet me know if you'd like to walk through anything together.`;

    case "urgency_based":
      return `Hi ${homeownerName} — saw the proposal was viewed again this morning.\n\nWe can get you on the schedule for early next week. Want me to reserve a slot?`;

    case "insurance_aware":
      return `Great news — your claim is approved.\n\nAll that's left is scheduling your install. Want me to walk through the deductible and next steps with you?`;

    case "price_objection":
      return `Totally understand wanting to compare costs.\n\nKeep in mind your insurance approved this exact scope, so your out-of-pocket won't change.`;

    case "closing_push":
      return `Ready to schedule? I can lock in your date for this week.\n\nLet me know what works best for you.`;

    default:
      return `Hey ${homeownerName}, just following up on the proposal.\n\nLet me know if you have any questions!`;
  }
}

function convertToHtml(text: string): string {
  return text
    .split("\n\n")
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
















































