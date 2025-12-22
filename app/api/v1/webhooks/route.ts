// GET /v1/webhooks - List webhooks
// POST /v1/webhooks - Create webhook

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

// GET /v1/webhooks
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: webhooks, error } = await supabase
    .from("webhooks")
    .select("id, url, event, active, created_at")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data: webhooks || [] });
});

// POST /v1/webhooks
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { url, event } = body;

  if (!url || !event) {
    throw new ApiError("400_INVALID_BODY", "url and event are required");
  }

  const validEvents = [
    "lead.created",
    "lead.updated",
    "lead.replied",
    "lead.intent.changed",
    "email.sent",
    "email.open",
    "email.click",
    "email.reply",
    "email.bounce",
    "email.spam",
    "broadcast.completed",
    "campaign.completed",
  ];

  if (!validEvents.includes(event)) {
    throw new ApiError("400_INVALID_BODY", `Invalid event type: ${event}`);
  }

  const { data: webhook, error } = await supabase
    .from("webhooks")
    .insert({
      workspace_id: auth.workspaceId,
      url,
      event,
      active: true,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data: webhook }, { status: 201 });
});



