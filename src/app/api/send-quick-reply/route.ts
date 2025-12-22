import { NextResponse } from "next/server";
import { getGmailAccessToken } from "@/lib/google/ensureToken";
import { sendGmailReply } from "@/lib/google/sendGmailReply";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId, threadId, template } = await req.json();

  if (!leadId || !threadId || !template) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // fetch lead for email context
  const { data: lead, error } = await supabase
    .from("leads")
    .select("email, first_name, company")
    .eq("id", leadId)
    .single();

  if (error || !lead?.email) {
    return NextResponse.json({ error: "Lead not found" }, { status: 400 });
  }

  const { accessToken, email: sender } = await getGmailAccessToken();

  await sendGmailReply(accessToken, {
    to: lead.email,
    from: sender,
    subject: `Re: Quick question`,  // TODO: fetch original subject if available
    threadId,
    bodyText: template,
  });

  return NextResponse.json({ ok: true });
}

