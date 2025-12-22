// app/api/settings/sending/test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json(
      { error: "User email required for test send" },
      { status: 400 }
    );
  }

  const { data: settings, error } = await supabase
    .from("workspace_sending_settings")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (error || !settings) {
    return NextResponse.json(
      { error: "Sending settings not configured" },
      { status: 400 }
    );
  }

  const from = `${settings.from_name} <${settings.from_email}>`;

  try {
    const result = await sendEmail({
      to: user.email,
      from,
      subject: "SmartSend Test Email",
      text: `This is a test email from SmartSend.

From name: ${settings.from_name}
From email: ${settings.from_email}
Reply-To: ${settings.reply_to_email ?? "not set"}

If this arrived in your inbox (not spam), your sending identity is working.`,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send test email" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Test email sent" },
      { status: 200 }
    );
  } catch (err) {
    console.error("Test send error:", err);
    return NextResponse.json(
      { error: "Failed to send test email" },
      { status: 500 }
    );
  }
}

























































