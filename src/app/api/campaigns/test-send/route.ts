import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getDefaultSender } from "@/lib/defaultSender";

export async function POST(req: NextRequest) {
  const { to, subject, html } = await req.json();
  if (!to || !subject || !html) {
    return NextResponse.json({ error: "Missing to/subject/html" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: { 
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {}
      } 
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's default sender
  const sender = await getDefaultSender(user.id);
  const fromEmail = sender || (process.env.NEXT_PUBLIC_DEFAULT_FROM ?? "SmartSend <no-reply@yourdomain.com>");

  const scheduledAt = new Date().toISOString();

  const { error } = await supabase.from("email_jobs").insert({
    user_id: user.id,
    campaign_id: null,
    to_email: to,
    subject,
    body_html: html,
    scheduled_at: scheduledAt,
    tracking_token: crypto.randomUUID().replace(/-/g, ""),
    from_email: fromEmail,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}