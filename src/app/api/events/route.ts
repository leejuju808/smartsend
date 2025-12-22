import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const emailId = new URL(req.url).searchParams.get("emailId");
  if (!emailId) return NextResponse.json({ opened: 0, clicked: 0 });

  const { data, error } = await supabaseAdmin
    .from("email_events")
    .select("event_type")
    .eq("email_id", emailId);

  if (error) return NextResponse.json({ opened: 0, clicked: 0 });

  const opened = data.filter(d => d.event_type === "opened").length;
  const clicked = data.filter(d => d.event_type === "clicked").length;
  return NextResponse.json({ opened, clicked });
}

