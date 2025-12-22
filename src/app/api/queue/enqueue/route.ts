import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json(); // {campaign_id, lead_id, to_email, subject, html?, text?, thread_id?}
    
    // Validate required fields
    if (!body.campaign_id || !body.lead_id || !body.to_email || !body.subject) {
      return NextResponse.json(
        { error: "Missing required fields: campaign_id, lead_id, to_email, subject" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("send_queue").insert({
      user_id: user.id,
      campaign_id: body.campaign_id,
      lead_id: body.lead_id,
      to_email: body.to_email,
      subject: body.subject,
      html: body.html ?? null,
      text: body.text ?? null,
      thread_id: body.thread_id ?? null,
      status: 'queued',
      next_attempt_at: new Date().toISOString()
    });
    
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Enqueue error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
