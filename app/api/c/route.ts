import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("u") || "/";
  const send_id = req.nextUrl.searchParams.get("s");
  const account_id = req.nextUrl.searchParams.get("a");

  if (send_id && account_id) {
    await supabase.from("email_events").insert({
      account_id,
      send_id,
      type: "click",
      url,
      user_agent: req.headers.get("user-agent") ?? undefined,
      ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0] || null,
    });
  }

  return NextResponse.redirect(url, { status: 302 });
}

