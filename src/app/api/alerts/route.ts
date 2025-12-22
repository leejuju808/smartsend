import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleError, parseSearchParams, requireUser, HttpError } from "@/lib/api/auth";

const alertsQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
  kind: z.string().trim().min(1).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const { campaignId, kind } = parseSearchParams(alertsQuerySchema, req);

    let query = supabase
      .from("system_alerts")
      .select("id, created_at, kind, campaign_id, meta")
      .eq("account_id", user.id)
      .order("created_at", { ascending: false });

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    if (kind) {
      query = query.eq("kind", kind);
    }

    const { data, error } = await query;

    if (error) {
      throw new HttpError(400, "failed_to_fetch_alerts", { hint: error.message });
    }

    return NextResponse.json({ alerts: data ?? [] });
  } catch (error) {
    return handleError(error);
  }
}







