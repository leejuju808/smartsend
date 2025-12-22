import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { email, source = "direct" } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Save to waitlist table
    const { error: waitlistError } = await supabase
      .from("waitlist")
      .upsert({ email: normalizedEmail }, { onConflict: "email" });

    if (waitlistError) {
      console.error("Waitlist insert error:", waitlistError);
    }

    // Save to public_signups for launch tracking (upsert to handle duplicates)
    const { error: signupError } = await supabase
      .from("public_signups")
      .upsert({
        email: normalizedEmail,
        source,
        beta: false,
      }, { onConflict: 'email', ignoreDuplicates: false });

    if (signupError) {
      console.error("Public signups insert error:", signupError);
      // Don't fail the request if tracking fails
    }

    console.log("New waitlist signup:", normalizedEmail, "from", source);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Waitlist signup error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add to waitlist" },
      { status: 500 }
    );
  }
}