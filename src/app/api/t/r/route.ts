import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/tracking";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("m");
  const u = req.nextUrl.searchParams.get("u");
  const target = safeUrl(u);

  if (!m || !target) {
    return NextResponse.redirect("https://smartsend.ai", { status: 302 });
  }

  const payload = verifyToken(m);
  if (!payload) return NextResponse.redirect(target, { status: 302 });

  const ua = req.headers.get("user-agent") ?? null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;

  await supabase.from("email_events").insert({
    workspace_id: payload.w,
    lead_id: payload.l,
    campaign_id: payload.c,
    event_type: "clicked",
    url: target,
    user_agent: ua,
    ip_address: ip,
    occurred_at: new Date().toISOString()
  });

  // Status → Clicked (don't override Replied)
  await supabase
    .from("leads")
    .update({ status: "Clicked", last_activity_at: new Date().toISOString() })
    .eq("id", payload.l)
    .neq("status", "Replied");

  return NextResponse.redirect(target, { status: 302 });
}

function safeUrl(u: string | null) {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}