import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, source, beta } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Save to public_signups for launch tracking
    const { error } = await supabase
      .from("public_signups")
      .insert({
        email: normalizedEmail,
        source: source || "direct",
        beta: beta || false,
      });

    if (error) {
      console.error("Public signups insert error:", error);
      return NextResponse.json(
        { error: "Failed to track signup" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Signup tracking error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to track signup" },
      { status: 500 }
    );
  }
}

