// Edge Function: inbox-ingest
// Ingests incoming messages, classifies intent, and updates threads

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// Intent classification prompt for roofing-specific intents
const INTENT_CLASSIFIER_PROMPT = `You are classifying homeowner messages for a roofing company.
Analyze the message and classify the intent into one of these categories:

- booking_request: Homeowner wants to schedule an appointment or estimate
- price_question: Asking about pricing or cost estimates
- warranty_claim: Warranty question or claim
- leak_emergency: Active leak, storm damage, or urgent repair needed
- schedule_change: Rescheduling or changing appointment time
- financing_question: Asking about payment plans or financing options
- ready_to_move_forward: Ready to approve, sign contract, or proceed
- send_proposal_again: Requesting proposal or estimate to be resent
- complaint: Complaint about service, quality, or communication
- referral: Referring someone else or asking about referral program
- not_interested: Declining service or not interested
- material_question: Question about materials, types of roofs, etc.
- unknown: Cannot determine intent or unclear message

Also determine urgency: "urgent" for leaks, emergencies, active water intrusion, complaints, or material failures. Otherwise "normal".

Return JSON only:
{
  "intent": "one of the intents above",
  "summary": "one sentence summary of the message",
  "urgency": "urgent" or "normal"
}`;

async function classifyIntent(content: string): Promise<{
  intent: string;
  summary: string;
  urgency: "urgent" | "normal";
}> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert at classifying homeowner messages for roofing companies. Return only valid JSON.",
        },
        {
          role: "user",
          content: `${INTENT_CLASSIFIER_PROMPT}\n\nMessage: "${content.substring(0, 2000)}"`,
        },
      ],
      temperature: 0,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    console.error("OpenAI API error:", await response.text());
    return {
      intent: "unknown",
      summary: content.substring(0, 100),
      urgency: "normal",
    };
  }

  const data = await response.json();
  const contentStr = data.choices?.[0]?.message?.content || "{}";

  try {
    const result = JSON.parse(contentStr);
    return {
      intent: result.intent || "unknown",
      summary: result.summary || content.substring(0, 100),
      urgency: (result.urgency === "urgent" ? "urgent" : "normal") as "urgent" | "normal",
    };
  } catch (e) {
    console.error("Failed to parse OpenAI response:", contentStr);
    return {
      intent: "unknown",
      summary: content.substring(0, 100),
      urgency: "normal",
    };
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { workspace_id, lead_id, content, channel = "email", sender_email, sender_name, subject, raw_payload } = payload;

    if (!workspace_id || !lead_id || !content) {
      return new Response(
        JSON.stringify({ error: "workspace_id, lead_id, and content are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Get or create thread
    const { data: threadResult, error: threadError } = await supabase.rpc(
      "get_or_create_inbox_thread",
      {
        p_workspace_id: workspace_id,
        p_lead_id: lead_id,
      }
    );

    if (threadError) {
      console.error("Error getting/creating thread:", threadError);
      return new Response(
        JSON.stringify({ error: "Failed to get or create thread" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const thread_id = threadResult;

    // 2. Classify intent using AI
    const classification = await classifyIntent(content);

    // 3. Insert message
    const { data: message, error: insertError } = await supabase
      .from("inbox_messages")
      .insert({
        workspace_id,
        thread_id,
        lead_id,
        direction: "inbound",
        content,
        channel,
        intent: classification.intent,
        ai_summary: classification.summary,
        sender_email,
        sender_name,
        subject,
        raw_payload: raw_payload || {},
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting message:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to insert message" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Update thread with classification and urgency
    const { error: updateError } = await supabase
      .from("inbox_threads")
      .update({
        last_message: content.substring(0, 200),
        last_intent: classification.intent,
        summary: classification.summary, // Simple summary for now (can be enhanced later)
        urgency: classification.urgency,
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread_id);

    if (updateError) {
      console.error("Error updating thread:", updateError);
      // Don't fail the request, message was inserted
    }

    // 5. Detect service/warranty requests and create tickets
    let serviceTicketCreated = false;
    if (classification.intent === "warranty_claim" || classification.intent === "leak_emergency") {
      try {
        // Try to find associated job_id
        let job_id: string | null = null;
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id")
          .eq("lead_id", lead_id)
          .eq("stage", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        
        if (jobs) {
          job_id = jobs.id;
        }

        // Call detect-service-request edge function
        const detectServiceUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/detect-service-request`;
        const detectResponse = await fetch(detectServiceUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            lead_id,
            message: content,
            job_id,
            workspace_id,
          }),
        });

        if (detectResponse.ok) {
          const detectResult = await detectResponse.json();
          if (detectResult.is_service_request && detectResult.ticket) {
            serviceTicketCreated = true;
            console.log("Service ticket created:", detectResult.ticket.id);
          }
        }
      } catch (serviceError) {
        console.error("Error detecting service request:", serviceError);
        // Don't fail the request if service detection fails
      }
    }

    // 6. Auto-create tasks based on intent
    let taskCreated = false;
    const taskDescriptionMap: Record<string, string> = {
      booking_request: `Schedule appointment for homeowner`,
      send_proposal_again: `Resend proposal to homeowner`,
      leak_emergency: `🚨 EMERGENCY: Respond to leak/emergency immediately`,
      ready_to_move_forward: `Prepare contract and next steps - homeowner ready to proceed`,
      schedule_change: `Reschedule appointment as requested`,
      warranty_claim: `Review and respond to warranty claim`,
      complaint: `Address homeowner complaint - urgent follow-up needed`,
    };

    if (taskDescriptionMap[classification.intent]) {
      // Try to extract date/time from message for appointments
      let dueAt: string | null = null;
      if (classification.intent === "booking_request" || classification.intent === "schedule_change") {
        // Try to extract date/time (simple pattern matching)
        const dateMatch = content.match(/(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}|\d{1,2}-\d{1,2})/i);
        const timeMatch = content.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?/i);
        
        if (dateMatch) {
          // Simple date parsing - in production, use a proper date parser
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          dueAt = tomorrow.toISOString();
        }
      }

      const taskTypeMap: Record<string, string> = {
        booking_request: "appointment",
        send_proposal_again: "send_proposal",
        leak_emergency: "emergency",
        ready_to_move_forward: "contract",
        schedule_change: "appointment",
        warranty_claim: "warranty",
        complaint: "followup",
      };

      const { error: taskError } = await supabase
        .from("inbox_tasks")
        .insert({
          workspace_id,
          thread_id,
          lead_id,
          message_id: message.id,
          description: taskDescriptionMap[classification.intent],
          due_at: dueAt,
          task_type: taskTypeMap[classification.intent] || null,
          completed: false,
        });

      if (!taskError) {
        taskCreated = true;
      } else {
        console.error("Error creating task:", taskError);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message_id: message.id,
        thread_id,
        intent: classification.intent,
        urgency: classification.urgency,
        task_created: taskCreated,
        service_ticket_created: serviceTicketCreated,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in inbox-ingest:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
