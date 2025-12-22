// POST /api/inbox/ingest
// Ingests incoming messages (called by webhooks, SMS handlers, etc.)

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const body = await req.json();

  const {
    lead_id,
    content,
    channel = "email",
    sender_email,
    sender_name,
    subject,
    raw_payload,
  } = body;

  if (!lead_id || !content) {
    return NextResponse.json(
      { error: "lead_id and content are required" },
      { status: 400 }
    );
  }

  try {
    // Call edge function to ingest and classify
    const ingestUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/inbox-ingest`;
    const response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        workspace_id,
        lead_id,
        content,
        channel,
        sender_email,
        sender_name,
        subject,
        raw_payload,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Edge function error:", error);
      return NextResponse.json(
        { error: "Failed to ingest message" },
        { status: 500 }
      );
    }

    const result = await response.json();
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error in inbox ingest:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































