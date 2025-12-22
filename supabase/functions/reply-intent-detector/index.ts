import OpenAI from "npm:openai@4";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import ical from "npm:ical-generator@3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { messageId, sender, subject, bodyText, userId, threadId } = body;

    if (!sender || !bodyText) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: sender, bodyText" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // --- Step 1: Detect intent using GPT model ---
    const aiResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an email intent classifier for sales replies. Analyze if the recipient wants to schedule a meeting.",
        },
        {
          role: "user",
          content: `Classify this reply: "${bodyText}".
Return ONLY one of these exact values: 'positive_meeting_intent', 'neutral', or 'negative'.`,
        },
      ],
      temperature: 0.3,
    });

    const label = aiResp.choices[0].message?.content?.trim().toLowerCase();

    // --- Step 2: Get user's Calendly link from profile (if available) ---
    let calendlyLink = "https://calendly.com/YOUR_CALENDLY_USERNAME";
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('calendly_url')
        .eq('id', userId)
        .single();
      
      if (profile?.calendly_url) {
        calendlyLink = profile.calendly_url;
      }
    }

    // --- Step 3: If positive, auto-create ICS + record meeting ---
    if (label === "positive_meeting_intent") {
      // Create ICS file for a proposed meeting (1 hour slot, starting 24h from now)
      const cal = ical({ name: "SmartSend Meeting" });
      const startTime = new Date(Date.now() + 86400000); // 24 hours from now
      const endTime = new Date(startTime.getTime() + 3600000); // 1 hour duration

      cal.createEvent({
        start: startTime,
        end: endTime,
        summary: "Discovery Call - SmartSend",
        description: `Auto-scheduled via SmartSend AI.\n\nBook a specific time: ${calendlyLink}`,
        location: calendlyLink,
        organizer: "SmartSend <noreply@smartsend.ai>",
      });

      const icsContent = cal.toString();

      // Insert meeting record
      const meetingData: any = {
        contact_email: sender,
        sender_email: sender, // For compatibility
        subject: subject || "Meeting Request",
        start_at: startTime.toISOString(),
        end_at: endTime.toISOString(),
        scheduled_at: startTime.toISOString(),
        status: "booked", // Set to "booked" for positive intent
        calendly_link: calendlyLink,
        calendly_url: calendlyLink, // For compatibility
        ics: icsContent,
        ics_blob: icsContent, // For compatibility
        location: calendlyLink,
        thread_id: threadId || messageId,
        detected_at: new Date().toISOString(),
        profile_id: userId, // Use profile_id for RLS
        user_id: userId, // Also set user_id for compatibility
      };

      const { data: meeting, error: insertError } = await supabase
        .from("meetings")
        .insert(meetingData)
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting meeting:", insertError);
        throw insertError;
      }

      // Log the detection event
      await supabase.from("ai_reply_events").insert({
        user_id: userId,
        contact_email: sender,
        intent_label: label,
        confidence: 0.95, // From GPT-4o-mini
        action_taken: "meeting_proposed",
        metadata: {
          messageId,
          subject,
          threadId,
          meetingId: meeting?.id,
        },
      }).catch(err => console.warn("Failed to log event:", err));

      return new Response(
        JSON.stringify({
          status: "booked",
          intent: label,
          calendly_link: calendlyLink,
          meeting_id: meeting?.id,
          ics_content: icsContent,
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200 
        }
      );
    }

    // --- Step 4: Save non-positive intents for tracking ---
    await supabase.from("ai_reply_events").insert({
      user_id: userId,
      contact_email: sender,
      intent_label: label || "unknown",
      confidence: 0.90,
      action_taken: "none",
      metadata: {
        messageId,
        subject,
        threadId,
      },
    }).catch(err => console.warn("Failed to log event:", err));

    return new Response(
      JSON.stringify({ 
        status: label,
        intent: label,
        action: "no_meeting_needed" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );

  } catch (err) {
    console.error("Error in reply-intent-detector:", err);
    return new Response(
      JSON.stringify({ 
        error: err.message,
        details: err.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
