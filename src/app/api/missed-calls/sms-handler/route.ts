// Block 37001 — SMS Conversation Handler with AI Lead Capture
// Handles incoming SMS responses from homeowners
// Uses AI to extract lead information and create/update leads

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface LeadExtraction {
  name?: string;
  address?: string;
  problem?: string;
  urgency?: "normal" | "high" | "emergency";
  intent?: string;
  needs_appointment?: boolean;
  appointment_preference?: string;
  insurance_claim?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, message, workspace_id, missed_call_id } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { error: "phone and message are required" },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = phone.startsWith("+") ? phone : `+1${phone.replace(/\D/g, "")}`;

    // Find or get missed call record
    let missedCall = null;
    if (missed_call_id) {
      const { data } = await supabase
        .from("missed_calls")
        .select("*")
        .eq("id", missed_call_id)
        .single();
      missedCall = data;
    } else {
      // Try to find most recent missed call for this phone
      const { data } = await supabase
        .from("missed_calls")
        .select("*")
        .eq("phone", normalizedPhone)
        .order("call_time", { ascending: false })
        .limit(1)
        .single();
      missedCall = data;
    }

    const workspaceId = workspace_id || missedCall?.workspace_id;

    // Get or create lead
    let lead = null;
    
    // Try to find existing lead by phone
    if (workspaceId) {
      // Check if leads table has workspace_id
      const { data: existingLead } = await supabase
        .from("leads")
        .select("*")
        .eq("phone", normalizedPhone)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (existingLead) {
        lead = existingLead;
      }
    } else {
      // Fallback: search by phone only
      const { data: existingLead } = await supabase
        .from("leads")
        .select("*")
        .eq("phone", normalizedPhone)
        .limit(1)
        .maybeSingle();

      if (existingLead) {
        lead = existingLead;
      }
    }

    // Use AI to extract structured data from message
    const extractionPrompt = `Extract roofing lead information from this homeowner message: "${message}"

Return JSON only (no markdown, no explanation):
{
  "name": "extracted name or empty string",
  "address": "extracted address or empty string",
  "problem": "description of roofing issue",
  "urgency": "normal" | "high" | "emergency",
  "intent": "brief intent summary",
  "needs_appointment": true/false,
  "appointment_preference": "time preference if mentioned",
  "insurance_claim": true/false
}

Emergency keywords: leak, water, dripping, ceiling, emergency, storm damage, urgent, flooding, damage
If any emergency keywords are present, set urgency to "emergency".`;

    let extracted: LeadExtraction = {};
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a lead extraction assistant. Extract structured data from homeowner messages. Return only valid JSON.",
          },
          {
            role: "user",
            content: extractionPrompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        extracted = JSON.parse(content) as LeadExtraction;
      }
    } catch (aiError) {
      console.error("AI extraction error:", aiError);
      // Continue with basic extraction
      extracted = {
        problem: message,
        urgency: message.toLowerCase().match(/(leak|water|dripping|ceiling|emergency|storm|urgent|flood)/) 
          ? "emergency" 
          : "normal",
        needs_appointment: message.toLowerCase().match(/(schedule|appointment|come out|visit|estimate)/) !== null,
      };
    }

    // Determine conversation step
    let step = "complete";
    if (!lead || !lead.first_name) {
      step = extracted.name ? (extracted.address ? "problem" : "address") : "name";
    } else if (!lead.address || !lead.address.trim()) {
      step = extracted.address ? "problem" : "address";
    } else if (!lead.notes || !lead.notes.trim()) {
      step = "problem";
    }

    // Create or update lead
    const leadData: any = {
      phone: normalizedPhone,
      notes: extracted.problem || message,
    };

    if (extracted.name) {
      const nameParts = extracted.name.trim().split(/\s+/);
      leadData.first_name = nameParts[0] || null;
      leadData.last_name = nameParts.slice(1).join(" ") || null;
    }

    if (extracted.address) {
      // Try to store address - check if leads table has address field
      if (lead) {
        // Update existing lead
        const updateData: any = { ...leadData };
        if (extracted.address) {
          // Try address field, or store in notes/custom
          updateData.address = extracted.address;
          if (!updateData.notes) updateData.notes = "";
          updateData.notes = `${extracted.address}\n\n${updateData.notes}`.trim();
        }
        
        if (workspaceId) updateData.workspace_id = workspaceId;
        
        const { data: updatedLead } = await supabase
          .from("leads")
          .update(updateData)
          .eq("id", lead.id)
          .select()
          .single();
        
        lead = updatedLead;
      } else {
        // Create new lead
        const newLeadData: any = {
          ...leadData,
          email: `${normalizedPhone.replace(/\D/g, "")}@sms.leads`, // Placeholder email
          status: "new",
          source: "missed_call",
        };
        
        if (extracted.address) {
          newLeadData.address = extracted.address;
          newLeadData.notes = `${extracted.address}\n\n${newLeadData.notes}`.trim();
        }
        
        if (workspaceId) newLeadData.workspace_id = workspaceId;
        
        const { data: newLead } = await supabase
          .from("leads")
          .insert(newLeadData)
          .select()
          .single();
        
        lead = newLead;
      }
    } else if (!lead) {
      // Create lead without address yet
      const newLeadData: any = {
        ...leadData,
        email: `${normalizedPhone.replace(/\D/g, "")}@sms.leads`,
        status: "new",
        source: "missed_call",
      };
      
      if (workspaceId) newLeadData.workspace_id = workspaceId;
      
      const { data: newLead } = await supabase
        .from("leads")
        .insert(newLeadData)
        .select()
        .single();
      
      lead = newLead;
    } else {
      // Update existing lead
      if (workspaceId) leadData.workspace_id = workspaceId;
      
      const { data: updatedLead } = await supabase
        .from("leads")
        .update(leadData)
        .eq("id", lead.id)
        .select()
        .single();
      
      lead = updatedLead;
    }

    // Check for emergency
    const isEmergency = extracted.urgency === "emergency" || 
      (message.toLowerCase().match(/(leak|water|dripping|ceiling|emergency|storm|urgent|flood)/) !== null);

    // Update missed call if exists
    if (missedCall) {
      await supabase
        .from("missed_calls")
        .update({
          processed: true,
          created_lead_id: lead?.id,
          emergency: isEmergency,
        })
        .eq("id", missedCall.id);
    }

    // Log conversation step
    if (missedCall?.id) {
      await supabase.from("call_lead_capture").insert({
        missed_call_id: missedCall.id,
        lead_id: lead?.id,
        workspace_id: workspaceId,
        step: step,
        value: extracted.address || extracted.name || extracted.problem || message,
        message_text: message,
        ai_extracted_data: extracted,
      });
    }

    // Handle emergency: create urgent task/notification
    if (isEmergency && lead) {
      // Try to create an urgent task
      try {
        const taskData: any = {
          lead_id: lead.id,
          description: `Emergency roofing request: ${extracted.problem || message}`,
          due_at: new Date().toISOString(),
          priority: "high",
          status: "open",
        };
        
        if (workspaceId) taskData.workspace_id = workspaceId;
        
        // Try inbox_tasks table first
        await supabase.from("inbox_tasks").insert(taskData).catch(() => {
          // Fallback to tasks table
          supabase.from("tasks").insert(taskData).catch(() => {
            console.warn("Could not create emergency task");
          });
        });
      } catch (taskError) {
        console.error("Error creating emergency task:", taskError);
      }
    }

    // Handle appointment booking if homeowner confirms a time
    let appointmentBooked = false;
    if (extracted.appointment_preference || message.toLowerCase().match(/(tomorrow|wednesday|thursday|friday|saturday|sunday|monday|tuesday|3 pm|10 am|morning|afternoon)/)) {
      // Try to parse appointment time from message
      const appointmentMatch = message.match(/(tomorrow|(\w+day))|(\d+)\s*(pm|am|:)/i);
      if (appointmentMatch && lead && extracted.address) {
        try {
          // Calculate appointment time
          let appointmentTime = new Date();
          if (message.toLowerCase().includes("tomorrow")) {
            appointmentTime.setDate(appointmentTime.getDate() + 1);
            appointmentTime.setHours(15, 0, 0, 0); // Default to 3 PM
          } else if (message.toLowerCase().includes("wednesday")) {
            const daysUntilWed = (3 - appointmentTime.getDay() + 7) % 7 || 7;
            appointmentTime.setDate(appointmentTime.getDate() + daysUntilWed);
            appointmentTime.setHours(10, 0, 0, 0); // Default to 10 AM
          } else {
            appointmentTime.setDate(appointmentTime.getDate() + 1);
            appointmentTime.setHours(15, 0, 0, 0);
          }

          // Try to book appointment using scheduler API
          if (workspaceId && extracted.address) {
            try {
              // Use internal API call - construct URL from request or use env var
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                (req.headers.get("host") ? `https://${req.headers.get("host")}` : "http://localhost:3000");
              
              const bookingResponse = await fetch(`${baseUrl}/api/scheduler/book`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-workspace-id": workspaceId,
                  // Forward auth if available
                  ...(req.headers.get("authorization") && {
                    authorization: req.headers.get("authorization")!,
                  }),
                },
                body: JSON.stringify({
                  appointment_type: isEmergency ? "leak_check" : "roof_inspection",
                  start_time: appointmentTime.toISOString(),
                  homeowner_name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Homeowner",
                  homeowner_email: lead.email || `${normalizedPhone.replace(/\D/g, "")}@sms.leads`,
                  homeowner_phone: normalizedPhone,
                  property_address: extracted.address,
                  notes: `Missed call lead - ${extracted.problem || message}`,
                  booking_source: "sms_reply",
                }),
              });

              if (bookingResponse.ok) {
                appointmentBooked = true;
                const bookingData = await bookingResponse.json();
                console.log("Appointment booked:", bookingData);
              } else {
                const errorData = await bookingResponse.json().catch(() => ({}));
                console.error("Failed to book appointment:", errorData);
              }
            } catch (bookingError) {
              console.error("Error booking appointment:", bookingError);
            }
          }
        } catch (parseError) {
          console.error("Error parsing appointment time:", parseError);
        }
      }
    }

    // Determine next message to send
    let nextMessage: string | null = null;
    
    if (appointmentBooked) {
      nextMessage = "Perfect! We've got you scheduled. We'll send you a confirmation text with the details. Is there anything else we should know about your roof?";
    } else if (step === "name" && !extracted.name) {
      nextMessage = "Can I get your name?";
    } else if (step === "address" && !extracted.address) {
      nextMessage = "What's the address?";
    } else if (step === "problem" && !extracted.problem) {
      nextMessage = "What's going on with your roof?";
    } else if (extracted.needs_appointment && !extracted.appointment_preference && !appointmentBooked) {
      // Offer appointment times
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(15, 0, 0, 0); // 3 PM
      
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);
      dayAfter.setHours(10, 0, 0, 0); // 10 AM
      
      const tomorrowStr = tomorrow.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      const dayAfterStr = dayAfter.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      
      nextMessage = `We can come out ${tomorrowStr} at 3 PM or ${dayAfterStr} at 10 AM. Which works for you?`;
    }

    return NextResponse.json({
      ok: true,
      lead_id: lead?.id,
      step: step,
      emergency: isEmergency,
      appointment_booked: appointmentBooked,
      next_message: nextMessage,
      extracted: extracted,
    });
  } catch (error) {
    console.error("Error in SMS handler:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
































