export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { verify } from "@/lib/events-sign";

const GIF = Buffer.from(
  "47494638396101000100910000ffffff00000021f90401000001002c00000000010001000002024401003b",
  "hex"
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cid = url.searchParams.get("cid") || "";
  const rid = url.searchParams.get("rid") || "";
  const s = url.searchParams.get("s") || "";

  if (!cid || !rid || !verify(`${cid}:${rid}:open`, s)) {
    return new NextResponse(GIF, {
      status: 200,
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
    });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data: recip } = await supabase
    .from("campaign_recipients")
    .select("id,user_id,campaign_id")
    .eq("id", rid)
    .eq("campaign_id", cid)
    .single();

  if (recip) {
    const ip = req.headers.get("x-forwarded-for") || (req as any).ip || "";
    const ua = req.headers.get("user-agent") || "";
    await Promise.all([
      supabase.from("email_events").insert({
        user_id: (recip as any).user_id,
        campaign_id: (recip as any).campaign_id,
        recipient_id: (recip as any).id,
        type: "open",
        ua,
        ip,
      }),
      supabase
        .from("campaign_recipients")
        .update({ open_count: (1 as any), last_open_at: new Date().toISOString() })
        .eq("id", (recip as any).id)
        .select(),
    ]);
  }

  return new NextResponse(GIF, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
}

