export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { verify } from "@/lib/events-sign";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cid = url.searchParams.get("cid") || "";
  const rid = url.searchParams.get("rid") || "";
  const b64 = url.searchParams.get("u") || "";
  const s = url.searchParams.get("s") || "";
  let target = "";
  try {
    target = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    /* noop */
  }

  if (!cid || !rid || !target || !/^https?:\/\//i.test(target) || !verify(`${cid}:${rid}:${b64}`, s)) {
    return NextResponse.redirect("https://smartsend.ai", 302);
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
        type: "click",
        url: target,
        ua,
        ip,
      }),
      supabase
        .from("campaign_recipients")
        .update({ click_count: (1 as any), last_click_at: new Date().toISOString() })
        .eq("id", (recip as any).id)
        .select(),
    ]);
  }

  return NextResponse.redirect(target, 302);
}

