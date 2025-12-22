import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Persists a send attempt metrics row (after validation + exclusion).
 * POST body:
 *  {
 *    workspaceId: string,
 *    campaignId?: string | null,
 *    attempted_total: number,
 *    blocked_suppressed: number,
 *    blocked_invalid: number,
 *    final_sendable: number,
 *    metadata?: Record<string, any>
 *  }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      workspaceId,
      campaignId = null,
      attempted_total,
      blocked_suppressed,
      blocked_invalid,
      final_sendable,
      metadata = {}
    } = body || {};

    if (!workspaceId || typeof attempted_total !== "number" || typeof final_sendable !== "number") {
      return NextResponse.json({ error: "Missing required metrics" }, { status: 400 });
    }

    const supabase = createClient();
    const { error } = await supabase.from("send_attempts").insert({
      workspace_id: workspaceId,
      campaign_id: campaignId,
      attempted_total,
      blocked_suppressed,
      blocked_invalid,
      final_sendable,
      metadata
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}