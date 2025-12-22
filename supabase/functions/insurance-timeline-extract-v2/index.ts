// Block 21050 — Insurance Timeline Engine v2 — Event Extraction
// Deep Claim Event Detection • Approval Date Extraction • Adjuster Journey Mapping Upgrade
//
// This function extracts insurance claim events from emails, PDFs, and attachments
// and creates timeline events with confidence scores and structured data.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExtractedEvent {
  event_type: string;
  event_date: string | null;
  event_time: string | null;
  confidence_score: number;
  raw_text: string;
  structured_data: Record<string, any>;
  source_type: string;
}

interface ExtractionRequest {
  thread_id?: string;
  contact_id?: string;
  lead_id?: string;
  email_id?: string;
  text: string;
  subject?: string;
  source_type?: string;
  sender_email?: string;
  attachment_urls?: string[];
}

// Advanced date parsing for insurance claim events
function parseInsuranceDate(text: string, contextDate?: Date): {
  date: Date | null;
  time: Date | null;
  confidence: number;
} {
  const now = contextDate || new Date();
  const lowerText = text.toLowerCase();
  
  // Pattern 1: "on August 14" or "on Aug 14"
  const monthDayPattern = /\b(?:on|by|for|scheduled for)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/i;
  const monthDayMatch = text.match(monthDayPattern);
  if (monthDayMatch) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
    };
    const monthKey = monthDayMatch[1].slice(0, 3).toLowerCase();
    const day = parseInt(monthDayMatch[2]);
    const year = monthDayMatch[3] ? parseInt(monthDayMatch[3]) : now.getFullYear();
    const date = new Date(year, months[monthKey], day);
    if (!isNaN(date.getTime())) {
      return { date, time: null, confidence: 0.9 };
    }
  }
  
  // Pattern 2: "scheduled for Tuesday" or "visit on Tuesday"
  const weekdayPattern = /\b(?:scheduled for|visit on|meeting on|appointment on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const weekdayMatch = text.match(weekdayPattern);
  if (weekdayMatch) {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const targetDay = weekdays.indexOf(weekdayMatch[1].toLowerCase());
    if (targetDay !== -1) {
      const candidate = new Date(now);
      for (let i = 0; i < 14; i++) {
        candidate.setDate(candidate.getDate() + 1);
        if (candidate.getDay() === targetDay) {
          return { date: candidate, time: null, confidence: 0.75 };
        }
      }
    }
  }
  
  // Pattern 3: "by 5pm on 8/22/25" or "visit on 8/14/24 at 2pm"
  const dateTimePattern = /\b(?:on|by|at)\s+(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)?\b/i;
  const dateTimeMatch = text.match(dateTimePattern);
  if (dateTimeMatch) {
    const month = parseInt(dateTimeMatch[1]) - 1;
    const day = parseInt(dateTimeMatch[2]);
    const yearPart = dateTimeMatch[3] ? parseInt(dateTimeMatch[3]) : now.getFullYear();
    const year = yearPart < 100 ? 2000 + yearPart : yearPart;
    let hour = dateTimeMatch[4] ? parseInt(dateTimeMatch[4]) : 9;
    const minute = dateTimeMatch[5] ? parseInt(dateTimeMatch[5]) : 0;
    const ampm = dateTimeMatch[6]?.toLowerCase();
    
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    
    const dateTime = new Date(year, month, day, hour, minute);
    if (!isNaN(dateTime.getTime())) {
      return { date: dateTime, time: dateTime, confidence: 0.85 };
    }
  }
  
  // Pattern 4: "approval issued May 3rd" or "payment released 7/8/25"
  const actionDatePattern = /\b(?:issued|released|sent|approved|filed|scheduled)\s+(?:on\s+)?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/i;
  const actionDateMatch = text.match(actionDatePattern);
  if (actionDateMatch) {
    const dateStr = actionDateMatch[1];
    // Try parsing as month name
    const monthNameMatch = dateStr.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i);
    if (monthNameMatch) {
      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
      };
      const monthKey = monthNameMatch[1].slice(0, 3).toLowerCase();
      const day = parseInt(monthNameMatch[2]);
      const date = new Date(now.getFullYear(), months[monthKey], day);
      if (!isNaN(date.getTime())) {
        return { date, time: null, confidence: 0.8 };
      }
    }
    // Try parsing as MM/DD/YY
    const slashMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (slashMatch) {
      const month = parseInt(slashMatch[1]) - 1;
      const day = parseInt(slashMatch[2]);
      const yearPart = slashMatch[3] ? parseInt(slashMatch[3]) : now.getFullYear();
      const year = yearPart < 100 ? 2000 + yearPart : yearPart;
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return { date, time: null, confidence: 0.8 };
      }
    }
  }
  
  // Pattern 5: ISO date "2025-08-22"
  const isoPattern = /\b(\d{4}-\d{1,2}-\d{1,2})\b/;
  const isoMatch = text.match(isoPattern);
  if (isoMatch) {
    const date = new Date(isoMatch[1]);
    if (!isNaN(date.getTime())) {
      return { date, time: null, confidence: 0.95 };
    }
  }
  
  return { date: null, time: null, confidence: 0.0 };
}

// Extract events from text using AI
async function extractEventsWithAI(
  text: string,
  subject: string | null,
  senderEmail: string | null,
  openai: OpenAI
): Promise<ExtractedEvent[]> {
  const prompt = `Analyze this insurance-related email and extract ALL claim events. Return JSON array of events.

Event types to detect:
- STORM_DATE: When storm occurred
- CLAIM_FILED_DATE: When claim was filed
- FIRST_CONTACT_FROM_CARRIER: First email/call from insurance company
- ADJUSTER_ASSIGNED_DESK: Desk adjuster assigned
- ADJUSTER_ASSIGNED_FIELD: Field adjuster assigned
- ADJUSTER_APPOINTMENT: Adjuster visit/appointment scheduled
- PHOTOS_REQUESTED: Insurance requests photos
- DOCUMENTS_REQUESTED: Insurance requests documents
- SCOPE_SENT: Scope of loss sent
- PRICING_UPDATED: Pricing/estimate updated
- SUPPLEMENT_REQUESTED: Supplement requested
- SUPPLEMENT_APPROVED: Supplement approved
- CLAIM_APPROVED_ACV: Claim approved for ACV only
- CLAIM_APPROVED_RCV: Claim approved for RCV
- PAYMENT_SENT: Payment sent/disbursed
- DEPRECIATION_RELEASED: Depreciation released
- FUNDS_DISBURSED: Funds disbursed

For each event, extract:
- event_type: one of the types above
- event_date: date in YYYY-MM-DD format (extract from text like "on August 14", "scheduled for Tuesday", "by 5pm on 8/22/25")
- event_time: timestamp if time mentioned (ISO format)
- confidence_score: 0.0-1.0 based on how certain you are
- structured_data: object with amounts, claim numbers, adjuster names, etc.

Email subject: ${subject || 'N/A'}
Email body:
${text.substring(0, 4000)}

Return JSON array only, no other text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "You are an expert at extracting insurance claim events from emails. Return JSON array only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    const events = result.events || [];
    
    // Enhance with date parsing
    return events.map((event: any) => {
      const parsedDate = parseInsuranceDate(text, new Date());
      return {
        event_type: event.event_type,
        event_date: event.event_date || (parsedDate.date ? parsedDate.date.toISOString().split('T')[0] : null),
        event_time: event.event_time || (parsedDate.time ? parsedDate.time.toISOString() : null),
        confidence_score: Math.max(event.confidence_score || 0.7, parsedDate.confidence),
        raw_text: text.substring(0, 500), // Store first 500 chars
        structured_data: event.structured_data || {},
        source_type: determineSourceType(senderEmail),
      };
    });
  } catch (error) {
    console.error("AI extraction error:", error);
    return [];
  }
}

// Determine source type from sender email
function determineSourceType(senderEmail: string | null): string {
  if (!senderEmail) return 'email_homeowner';
  
  const email = senderEmail.toLowerCase();
  
  // Check for adjuster emails (common patterns)
  if (email.includes('adjuster') || email.includes('claims') || email.includes('insurance')) {
    return 'email_adjuster';
  }
  
  // Check for carrier domains
  const carrierDomains = [
    'statefarm.com', 'allstate.com', 'farmers.com', 'usaa.com',
    'libertymutual.com', 'progressive.com', 'geico.com', 'nationwide.com',
    'travelers.com', 'americanfamily.com', 'erie.com'
  ];
  
  if (carrierDomains.some(domain => email.includes(domain))) {
    return 'email_carrier';
  }
  
  return 'email_homeowner';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const openai = new OpenAI({
      apiKey: Deno.env.get("OPENAI_API_KEY"),
    });

    const request: ExtractionRequest = await req.json();
    const { thread_id, contact_id, lead_id, email_id, text, subject, source_type, sender_email, attachment_urls } = request;

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract events using AI
    const extractedEvents = await extractEventsWithAI(
      text,
      subject || null,
      sender_email || null,
      openai
    );

    // Create timeline events in database
    const createdEvents = [];
    for (const event of extractedEvents) {
      try {
        const { data, error } = await supabaseClient.rpc('create_timeline_event', {
          p_event_type: event.event_type,
          p_event_payload: event.structured_data,
          p_event_date: event.event_date,
          p_event_time: event.event_time,
          p_thread_id: thread_id || null,
          p_contact_id: contact_id || null,
          p_lead_id: lead_id || null,
          p_email_id: email_id || null,
          p_detected_from: 'email',
          p_source_type: source_type || event.source_type,
          p_confidence_score: event.confidence_score,
          p_raw_text: event.raw_text,
          p_structured_data: event.structured_data,
        });

        if (error) {
          console.error("Error creating timeline event:", error);
        } else {
          createdEvents.push({ event_type: event.event_type, id: data });
        }
      } catch (err) {
        console.error("Error processing event:", err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        events_extracted: extractedEvents.length,
        events_created: createdEvents.length,
        events: createdEvents,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
















































