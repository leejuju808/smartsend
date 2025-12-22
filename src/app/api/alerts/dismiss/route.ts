import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleError, parseOrThrow, requireUser, HttpError } from "@/lib/api/auth";

const dismissAlertSchema = z.object({
  campaignId: z.string().uuid(),
  kind: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const payload = parseOrThrow(dismissAlertSchema, await req.json());
    const { supabase } = await requireUser();

    const { error } = await supabase
      .from("system_alerts")
      .delete()
      .eq("campaign_id", payload.campaignId)
      .eq("kind", payload.kind);

    if (error) {
      throw new HttpError(400, "failed_to_dismiss_alert", { hint: error.message });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}







