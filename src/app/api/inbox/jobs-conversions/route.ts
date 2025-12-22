import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLogger";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      contact_id,
      thread_id,
      appointment_id,
      call_log_id,
      conversion_type,
    } = body;

    if (!contact_id || !conversion_type) {
      return NextResponse.json(
        { error: "contact_id and conversion_type are required" },
        { status: 400 }
      );
    }

    // Get workspace_id from contact
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("workspace_id")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", contact.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Resolve campaign_id (needed for due-diligence audit trails + pipeline views)
    let campaign_id: string | null = null;
    if (thread_id) {
      const { data: thread } = await supabase
        .from("inbox_threads")
        .select("campaign_id")
        .eq("id", thread_id)
        .maybeSingle();
      campaign_id = (thread as any)?.campaign_id ?? null;
    }

    // Insert conversion
    const { data: conversion, error: insertError } = await supabase
      .from("jobs_conversions")
      .insert({
        workspace_id: contact.workspace_id,
        contact_id,
        thread_id,
        appointment_id,
        call_log_id,
        campaign_id,
        conversion_type,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting conversion:", insertError);
      return NextResponse.json(
        { error: "Failed to log conversion", details: insertError.message },
        { status: 500 }
      );
    }

    // Best-effort logging: conversions should be traceable without memory.
    // Reuse existing activity taxonomy (appointment_booked = "booked" moment).
    if (String(conversion_type).toLowerCase().includes("book")) {
      await logActivity({
        workspace_id: contact.workspace_id,
        category: "scheduler",
        type: "appointment_booked",
        event_type: "appointment_booked",
        event_data: {
          conversion_type,
          thread_id: thread_id ?? null,
        },
        contact_id,
        campaign_id: campaign_id ?? undefined,
        user_id: user.id,
      });
    } else {
      await logActivity({
        workspace_id: contact.workspace_id,
        category: "pipeline",
        type: "pipeline_moved",
        event_type: "pipeline_moved",
        event_data: {
          conversion_type,
          thread_id: thread_id ?? null,
        },
        contact_id,
        campaign_id: campaign_id ?? undefined,
        user_id: user.id,
      });
    }

    return NextResponse.json({ conversion });
  } catch (error: any) {
    console.error("Error in jobs-conversions route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



















































