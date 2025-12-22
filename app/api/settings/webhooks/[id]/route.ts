// DELETE /api/settings/webhooks/{id} - Delete webhook

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookId = req.nextUrl.pathname.split("/")[4]; // settings/webhooks/{id}
  if (!webhookId) {
    return NextResponse.json({ error: "Webhook ID is required" }, { status: 400 });
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
      { error: "Only owners and admins can delete webhooks" },
      { status: 403 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify webhook belongs to workspace
  const { data: webhook } = await serviceSupabase
    .from("webhooks")
    .select("id")
    .eq("id", webhookId)
    .eq("workspace_id", membership.workspace_id)
    .single();

  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const { error } = await serviceSupabase
    .from("webhooks")
    .delete()
    .eq("id", webhookId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}



