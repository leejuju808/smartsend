import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { event, source } = await req.json();

    if (!event) {
      return NextResponse.json(
        { error: "Missing required field: event" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { error } = await supabase.from("launch_events").insert({
      event,
      source: source || null,
    });

    if (error) {
      console.error("Failed to log launch event:", error);
      return NextResponse.json(
        { error: "Failed to log event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Launch event logging error:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
