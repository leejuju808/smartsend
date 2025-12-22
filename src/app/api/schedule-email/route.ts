import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaignId, to, subject, html, scheduledAt, workspaceId } = body;

    // Validate required fields
    if (!to || !subject || !html || !scheduledAt) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, html, scheduledAt" },
        { status: 400 }
      );
    }

    const cookieStore = cookies();
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (k: string) => cookieStore.get(k)?.value } }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate scheduled time is in the future
    const scheduledTime = new Date(scheduledAt);
    if (scheduledTime <= new Date()) {
      return NextResponse.json(
        { error: "Scheduled time must be in the future" },
        { status: 400 }
      );
    }

    // Insert email job
    const { data, error } = await supabase.from("email_jobs").insert({
      user_id: user.id,
      workspace_id: workspaceId || user.id, // fallback to user.id if no workspaceId
      campaign_id: campaignId || null,
      to_email: to,
      subject,
      body_html: html,
      scheduled_at: scheduledTime.toISOString(),
      status: "queued",
    }).select().single();

    if (error) {
      console.error("Error inserting email job:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ 
      ok: true, 
      jobId: data.id,
      message: "Email scheduled successfully" 
    });

  } catch (error) {
    console.error("Error in schedule-email API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}