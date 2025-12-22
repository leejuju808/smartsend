import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE!,
      { cookies: () => new Map() }
    );

    const { data: replies, error } = await supabase
      .from("email_replies")
      .select("id, from_email, body, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    return NextResponse.json({ replies });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}