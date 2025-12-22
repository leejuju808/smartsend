import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PIXEL = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120,
  156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 46, 27, 0, 0, 0, 0, 73, 69, 78, 68, 174,
  66, 96, 130,
]);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const outboxId = url.searchParams.get("o");

    if (outboxId) {
      const ip = req.headers.get("x-forwarded-for") ?? req.ip ?? "";
      const ua = req.headers.get("user-agent") ?? "";

      const { data: ob } = await sb
        .from("outbox_requests")
        .select("id,thread_id,campaign_id,lead_id")
        .eq("id", outboxId)
        .limit(1)
        .maybeSingle();

      if (ob) {
        await sb.from("tracking_events").insert({
          kind: "opened",
          outbox_id: ob.id,
          thread_id: ob.thread_id,
          campaign_id: ob.campaign_id,
          lead_id: ob.lead_id,
          ua,
          ip,
        });
      }
    }
  } catch {
    // swallow errors to avoid surfacing pixel issues
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}