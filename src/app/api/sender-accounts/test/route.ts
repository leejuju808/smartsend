import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSenderAccount } from "@/lib/senderPool";

export async function POST(req: NextRequest) {
  try {
    const { sender_id, to_email } = await req.json();

    if (!sender_id || !to_email) {
      return NextResponse.json({ error: "sender_id and to_email required" }, { status: 400 });
    }

    // Get sender account
    const sender = await getSenderAccount(sender_id);

    // TODO: Actually send email using sender.oauth_json or smtp_json
    // For now, simulate success
    // const sendResult = await sendEmailWithProvider({
    //   provider: sender.provider,
    //   credentials: sender.provider === 'smtp' ? sender.smtp_json : sender.oauth_json,
    //   to: to_email,
    //   from: sender.email,
    //   fromName: sender.display_name || sender.email,
    //   subject: "Test Email from SmartSend",
    //   body: `<p>This is a test email from ${sender.email}</p>`,
    // });

    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return NextResponse.json({
      ok: true,
      message: "Test email sent successfully",
    });
  } catch (error: any) {
    console.error("Test send error:", error);
    return NextResponse.json({ error: error.message || "Failed to send test email" }, { status: 500 });
  }
}

