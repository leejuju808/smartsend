// Block 98000 — SmartSend Auto-Booking Engine v1
// Edge Function: /autoBookAppointment
//
// This engine attempts to book an appointment AUTOMATICALLY when a reply shows booking intent.
// It:
// 1. Detects booking intent from homeowner message
// 2. Fetches user availability
// 3. Suggests next available time slot
// 4. Creates appointment
// 5. Sends notification to roofer

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://esm.sh/openai@4.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: openaiApiKey });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      user_id,
      message,
      lead_id,
      homeowner_name,
      address,
      homeowner_email,
      homeowner_phone,
    } = await req.json();

    if (!user_id || !message) {
      return new Response(
        JSON.stringify({ error: "user_id and message are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 1: Detect booking intent
    const intentPrompt = `Classify if this homeowner is trying to BOOK a roofing estimate.

Reply:
${message}

Return ONLY valid JSON:
{ "wants_booking": true/false, "confidence": 0.0-1.0 }`;

    const intentRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: intentPrompt }],
      response_format: { type: "json_object" },
    });

    const bookingIntent = JSON.parse(
      intentRes.choices[0].message.content || '{"wants_booking": false}'
    );

    if (!bookingIntent.wants_booking || bookingIntent.confidence < 0.7) {
      return new Response(
        JSON.stringify({ booked: false, reason: "no_booking_intent" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 2: Fetch user availability
    const { data: availability, error: availError } = await supabase
      .from("user_availability")
      .select("*")
      .eq("user_id", user_id)
      .order("weekday, start_time");

    if (availError || !availability || availability.length === 0) {
      // Seed default availability if none exists
      await supabase.rpc("seed_default_availability", { p_user_id: user_id });

      // Fetch again after seeding
      const { data: availabilityRetry } = await supabase
        .from("user_availability")
        .select("*")
        .eq("user_id", user_id)
        .order("weekday, start_time");

      if (!availabilityRetry || availabilityRetry.length === 0) {
        return new Response(
          JSON.stringify({ booked: false, reason: "no_availability_set" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Step 3: Get existing appointments to avoid conflicts
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const { data: existingAppointments } = await supabase
      .from("appointments")
      .select("date, time")
      .eq("user_id", user_id)
      .eq("status", "scheduled")
      .gte("date", today.toISOString().split("T")[0])
      .lte("date", nextWeek.toISOString().split("T")[0]);

    const bookedSlots = new Set(
      (existingAppointments || []).map((a) => `${a.date}|${a.time}`)
    );

    // Step 4: Find next available slot
    const availabilityData = availability || [];
    let suggestedDate: string | null = null;
    let suggestedTime: string | null = null;

    // Try each day for the next 7 days
    for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + daysAhead);
      const weekday = checkDate.getDay(); // 0=Sun, 1=Mon, etc.
      const dbWeekday = weekday === 0 ? 7 : weekday; // Convert to 1=Mon, 7=Sun

      // Find availability for this weekday
      const dayAvailability = availabilityData.find(
        (a) => a.weekday === dbWeekday
      );

      if (dayAvailability) {
        const slotKey = `${checkDate.toISOString().split("T")[0]}|${dayAvailability.start_time}`;
        if (!bookedSlots.has(slotKey)) {
          suggestedDate = checkDate.toISOString().split("T")[0];
          suggestedTime = dayAvailability.start_time;
          break;
        }
      }
    }

    if (!suggestedDate || !suggestedTime) {
      return new Response(
        JSON.stringify({
          booked: false,
          reason: "no_available_slots",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 5: Create appointment
    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .insert({
        user_id,
        lead_id: lead_id || null,
        homeowner_name: homeowner_name || null,
        homeowner_address: address || null,
        homeowner_email: homeowner_email || null,
        homeowner_phone: homeowner_phone || null,
        date: suggestedDate,
        time: suggestedTime,
        status: "scheduled",
        notes: `Auto-booked from message: "${message.substring(0, 200)}"`,
      })
      .select()
      .single();

    if (apptError || !appointment) {
      console.error("Error creating appointment:", apptError);
      return new Response(
        JSON.stringify({ booked: false, reason: "failed_to_create" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 6: Send notification to roofer
    try {
      await supabase.from("notifications").insert({
        user_id,
        title: "New Appointment Booked",
        message: `Estimate booked for ${suggestedDate} at ${suggestedTime} with ${homeowner_name || "homeowner"}.`,
        type: "system",
        read: false,
      });
    } catch (notifError) {
      console.error("Error creating notification:", notifError);
      // Don't fail the whole request if notification fails
    }

    return new Response(
      JSON.stringify({
        booked: true,
        appointment: {
          id: appointment.id,
          date: appointment.date,
          time: appointment.time,
          homeowner_name: appointment.homeowner_name,
          homeowner_address: appointment.homeowner_address,
        },
        confirmation_message: `Hi ${homeowner_name || "there"},  

You're all set — we'll be there on ${suggestedDate} around ${suggestedTime}.  

Looking forward to helping with the roof.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in autoBookAppointment:", error);
    return new Response(
      JSON.stringify({
        booked: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});


























