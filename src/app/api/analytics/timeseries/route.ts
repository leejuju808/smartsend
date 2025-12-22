import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const [replies, meetings] = await Promise.all([
      supabase.from("metrics_replies_daily").select("day,replies").order("day", { ascending: true }),
      supabase.from("metrics_meetings_daily").select("day,meetings").order("day", { ascending: true })
    ]);

    return NextResponse.json({
      replies_daily: replies.data ?? [],
      meetings_daily: meetings.data ?? []
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "timeseries failed" }, { status: 500 });
  }
}
