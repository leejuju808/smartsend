import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { thread_id, subject, body: messageBody, to_email, from_email } = body;

    if (!thread_id || !messageBody || !to_email) {
      return NextResponse.json(
        { error: "Missing required fields: thread_id, body, to_email" },
        { status: 400 }
      );
    }

    // Insert outgoing message
    const { data: outgoingMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        thread_id,
        subject: subject || null,
        body: messageBody,
        direction: "out",
        from_email: from_email || user.email || null,
        to_email,
        account_id: user.id,
        is_read: true,
        date: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting message:", insertError);
      return NextResponse.json(
        { error: "Failed to save reply" },
        { status: 500 }
      );
    }

    // TODO: Hook for actual email delivery
    // This is a stub - implement your email sending logic here
    // Example:
    // await sendEmailViaProvider({
    //   to: to_email,
    //   from: from_email || user.email,
    //   subject: subject || "Re: Message",
    //   body: messageBody,
    //   thread_id,
    // });

    return NextResponse.json({
      success: true,
      message: outgoingMessage,
    });
  } catch (error) {
    console.error("Error in send reply route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}