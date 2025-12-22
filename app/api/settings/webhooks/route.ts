// Webhook management endpoints (using session auth instead of API key)
// GET /api/settings/webhooks - List webhooks
// POST /api/settings/webhooks - Create webhook

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// GET /api/settings/webhooks
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: webhooks, error } = await serviceSupabase
    .from("webhooks")
    .select("id, url, event, active, created_at")
    .eq("workspace_id", membership.workspace_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: webhooks || [] });
}

// POST /api/settings/webhooks
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  // Check permissions
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only owners and admins can create webhooks" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { url, event } = body;

  if (!url || !event) {
    return NextResponse.json(
      { error: "url and event are required" },
      { status: 400 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: webhook, error } = await serviceSupabase
    .from("webhooks")
    .insert({
      workspace_id: membership.workspace_id,
      url,
      event,
      active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: webhook }, { status: 201 });
}



