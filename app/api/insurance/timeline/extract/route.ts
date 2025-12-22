// Block 21050 — Insurance Timeline Engine v2 — Event Extraction API
// POST /api/insurance/timeline/extract
// Extracts insurance claim events from emails, PDFs, and attachments

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      thread_id,
      contact_id,
      lead_id,
      email_id,
      text,
      subject,
      source_type,
      sender_email,
      attachment_urls,
    } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // Call the Supabase Edge Function for event extraction
    const { data, error } = await supabase.functions.invoke("insurance-timeline-extract-v2", {
      body: {
        thread_id,
        contact_id,
        lead_id,
        email_id,
        text,
        subject,
        source_type,
        sender_email,
        attachment_urls,
      },
    });

    if (error) {
      console.error("Event extraction error:", error);
      return NextResponse.json(
        { error: "Failed to extract events", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
















































