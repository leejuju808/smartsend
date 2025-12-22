import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Pull latest inbound replies and their meeting (if any)
    const { data, error } = await supabase
      .from("replies_with_meetings")
      .select(
        "message_id, sender_email, subject, body_text, received_at, meeting_id, calendly_url, status"
      )
      .order("received_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}