import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createServerClient } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

type Body = {
  jobId: string;
  channel?: "email" | "sms";
  tone?: "friendly" | "professional" | "direct";
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json()) as Body;
    const { jobId, channel = "email", tone = "friendly" } = body;

    if (!jobId) {
      return new NextResponse("Missing jobId", { status: 400 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return new NextResponse("Missing org_id", { status: 400 });
    }

    // NEW: load fast estimate URL from settings
    const { data: settings } = await supabase
      .from("organization_notification_settings")
      .select("fast_estimate_url")
      .eq("org_id", orgId)
      .maybeSingle();

    const fastEstimateUrl = settings?.fast_estimate_url || null;

    // 1) Get job info from roofing_jobs_with_health view
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs_with_health")
      .select("job_id, org_id, homeowner_name, homeowner_email, address, status")
      .eq("job_id", jobId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (jobError || !job) {
      console.error("Could not load job for AI reply", jobError);
      return new NextResponse("Job not found", { status: 404 });
    }

    // 2) Get the thread_id from the actual roofing_jobs table
    const { data: jobDetails, error: jobDetailsError } = await supabase
      .from("roofing_jobs")
      .select("thread_id")
      .eq("id", jobId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (jobDetailsError) {
      console.error("Could not load job details for AI reply", jobDetailsError);
    }

    // 3) Get latest homeowner message in this thread
    let lastInbound = null;
    let homeownerText = "Homeowner is interested in roofing work. No specific message text found.";

    if (jobDetails?.thread_id) {
      const { data: messages, error: msgError } = await supabase
        .from("inbox_messages")
        .select("id, direction, body_text, body_html, body_clean, created_at, received_at")
        .eq("thread_id", jobDetails.thread_id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (msgError) {
        console.error("Could not load messages for AI reply", msgError);
      } else {
        // Find last inbound message
        lastInbound = (messages || []).find(
          (m) => m.direction === "inbound" || m.direction === "in"
        );

        if (lastInbound) {
          // Extract text from message (try body_clean, body_text, or body_html)
          homeownerText =
            lastInbound.body_clean ||
            lastInbound.body_text ||
            lastInbound.body_html?.replace(/<[^>]*>/g, "") ||
            homeownerText;
        }
      }
    }

    const styleHint =
      channel === "sms"
        ? "Reply as a short, clear SMS text message. No subject line."
        : "Reply as a short, clear email. Include a simple greeting and sign off.";

    let toneHint = "";
    if (tone === "friendly") {
      toneHint = "Sound friendly, helpful, and straightforward.";
    } else if (tone === "professional") {
      toneHint = "Sound professional, calm, and confident.";
    } else if (tone === "direct") {
      toneHint = "Sound direct, concise, and to the point.";
    }

    const bookingHint = fastEstimateUrl
      ? `If it feels natural, include this booking link so they can pick a time directly: ${fastEstimateUrl}`
      : `If it feels natural, suggest 1–2 time windows they could choose for an estimate.`;

    const prompt = `
You are replying on behalf of a local roofing company.

Job context:
- Homeowner name: ${job.homeowner_name || "Homeowner"}
- Email: ${job.homeowner_email || "unknown"}
- Address: ${job.address || "not provided"}
- Roof type (if known): ${(job as any).roof_type || "not specified"}
- Current status: ${job.status || "new lead"}

The homeowner's latest message:

"""
${homeownerText}
"""

Your goal:
- Confirm what they need (inspection, estimate, repair, replacement, storm damage, etc.)
- Offer a clear next step: suggest 1–2 time windows for an estimate or inspection
- Keep it easy to say yes (simple, no pressure)
- Ask 1–2 crucial details only if needed (for example: single story vs two story)
${bookingHint}

${styleHint}
${toneHint}

Return only the message text to send back. No extra commentary.
    `.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You write short, effective replies for a roofing company." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 220,
    });

    const suggestion =
      completion.choices[0]?.message?.content?.trim() ||
      "Hi there, thanks for reaching out about your roof. When are you available for a quick estimate?";

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("AI reply error", err);
    return new NextResponse("Server error", { status: 500 });
  }
}

