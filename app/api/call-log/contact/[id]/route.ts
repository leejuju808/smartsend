// Block 13100 — Direct Call Log + Phone Activity Tracking v1
// GET /api/call-log/contact/[id]
// Get all call logs for a specific contact

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current org_id
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Verify contact belongs to org
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, org_id")
      .eq("id", params.id)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    if (contact.org_id !== orgId) {
      return NextResponse.json(
        { error: "Contact does not belong to your organization" },
        { status: 403 }
      );
    }

    // Get call logs for this contact
    const { data: callLogs, error: callLogsError } = await supabase
      .from("call_logs")
      .select(`
        *,
        user:user_id (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq("contact_id", params.id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (callLogsError) {
      console.error("[Call Log] Fetch error:", callLogsError);
      return NextResponse.json(
        { error: "Failed to fetch call logs", details: callLogsError.message },
        { status: 500 }
      );
    }

    // Format user data
    const formattedLogs = callLogs?.map((log: any) => ({
      ...log,
      user: log.user ? {
        id: log.user.id,
        email: log.user.email,
        name: log.user.raw_user_meta_data?.full_name || log.user.email,
      } : null,
    })) || [];

    return NextResponse.json({
      success: true,
      callLogs: formattedLogs,
    });
  } catch (error) {
    console.error("[Call Log] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























































