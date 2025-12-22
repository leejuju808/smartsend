// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// API endpoint: Homeowner satisfaction pulse
// Creates service ticket if concern detected

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, job_id, homeowner_id, satisfaction_level, feedback_text } = body;

    if (!satisfaction_level) {
      return NextResponse.json(
        { error: "satisfaction_level is required" },
        { status: 400 }
      );
    }

    if (!["good", "concern", "needs_attention"].includes(satisfaction_level)) {
      return NextResponse.json(
        { error: "satisfaction_level must be: good, concern, or needs_attention" },
        { status: 400 }
      );
    }

    let final_homeowner_id: string | null = homeowner_id || null;
    let final_job_id: string | null = job_id || null;

    // Validate token if provided (for homeowner portal)
    if (token) {
      const { data: session, error: sessionError } = await supabase
        .from("homeowner_sessions")
        .select("*, homeowners(id, job_id)")
        .eq("token", token)
        .single();

      if (sessionError || !session) {
        return NextResponse.json(
          { error: "Invalid or expired token" },
          { status: 401 }
        );
      }

      if (new Date(session.expires_at) < new Date()) {
        return NextResponse.json(
          { error: "Token has expired" },
          { status: 401 }
        );
      }

      const homeowner = (session as any).homeowners;
      final_homeowner_id = homeowner?.id || null;
      final_job_id = homeowner?.job_id || final_job_id;
    }

    if (!final_job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Insert satisfaction pulse
    const { data: pulse, error: pulseError } = await supabase
      .from("homeowner_satisfaction_pulse")
      .insert({
        job_id: final_job_id,
        homeowner_id: final_homeowner_id,
        satisfaction_level,
        feedback_text: feedback_text || null,
      })
      .select()
      .single();

    if (pulseError) {
      console.error("Error creating satisfaction pulse:", pulseError);
      return NextResponse.json(
        { error: "Failed to record satisfaction" },
        { status: 500 }
      );
    }

    // If concern or needs_attention, service ticket should be auto-created via trigger
    // But we can also check and create manually here if needed
    let service_ticket_id = null;
    if (satisfaction_level !== "good") {
      // Check if service_tickets table exists and create ticket
      const { data: tables } = await supabase
        .from("information_schema.tables")
        .select("table_name")
        .eq("table_schema", "public")
        .eq("table_name", "service_tickets")
        .single();

      if (tables) {
        // Create service ticket
        const { data: ticket, error: ticketError } = await supabase
          .from("service_tickets")
          .insert({
            job_id: final_job_id,
            title: `Homeowner Concern: ${satisfaction_level}`,
            description:
              feedback_text ||
              `Homeowner reported: ${satisfaction_level}`,
            priority: satisfaction_level === "needs_attention" ? "high" : "medium",
            status: "open",
            created_by_type: "homeowner",
          })
          .select()
          .single();

        if (!ticketError && ticket) {
          service_ticket_id = ticket.id;

          // Update pulse with ticket ID
          await supabase
            .from("homeowner_satisfaction_pulse")
            .update({ service_ticket_id })
            .eq("id", pulse.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      pulse: {
        ...pulse,
        service_ticket_id,
      },
      service_ticket_created: service_ticket_id !== null,
    });
  } catch (error: any) {
    console.error("Error in satisfaction ping:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























