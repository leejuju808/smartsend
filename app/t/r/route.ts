import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  }
);

function safeUrl(raw: string | null) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const logId = req.nextUrl.searchParams.get("l");      // campaign_logs.id
  const target = req.nextUrl.searchParams.get("u");     // encoded URL (plain or b64)
  const b64 = req.nextUrl.searchParams.get("b64");

  const decoded = b64 === "1"
    ? (() => { try { return atob(target ?? ""); } catch { return null; } })()
    : target;

  const url = safeUrl(decoded);

  const now = new Date().toISOString();

  if (logId) {
    await supabase.from("campaign_events").insert({
      log_id: logId,
      event_type: "clicked",
      meta: { url },
      created_at: now,
    });
    await supabase.rpc("bump_click", { p_log_id: logId, p_now: now });
  }

  // If url invalid, send to a neutral page
  if (!url) {
    return NextResponse.redirect(new URL("/", req.url), { status: 302 });
  }

  return NextResponse.redirect(url, { status: 302 });
}