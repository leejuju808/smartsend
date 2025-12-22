import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * POST /api/contacts/enrich-bulk
 * Bulk enriches multiple contacts
 * 
 * Body: {
 *   contact_ids?: string[] (optional - if not provided, enriches all contacts in workspace),
 *   limit?: number (default: 1000)
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { contact_ids, limit = 1000 } = body;

  // Call bulk enrichment function
  const { data: results, error } = await supabase.rpc("enrich_contacts_bulk", {
    p_contact_ids: contact_ids || null,
    p_workspace_id: workspaceId,
    p_limit: Math.min(limit, 5000), // Cap at 5000 for safety
  });

  if (error) {
    console.error("Bulk enrichment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to enrich contacts" },
      { status: 500 }
    );
  }

  const enriched = results?.filter((r: any) => r.enriched).length || 0;
  const failed = results?.filter((r: any) => !r.enriched).length || 0;

  return NextResponse.json({
    ok: true,
    total: results?.length || 0,
    enriched,
    failed,
    results: results || [],
  });
}




























































