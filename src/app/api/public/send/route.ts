import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/authApiKey";
import { createClient } from "@supabase/supabase-js";
import { sendNotification } from "../../../../lib/notify";

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const keyCache = new Map();
    if (keyCache.has(ip) && Date.now() - keyCache.get(ip) < 1000)
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    keyCache.set(ip, Date.now());

    const key = req.headers.get("authorization")?.replace("Bearer ", "");
    const workspace_id = await verifyApiKey(key!);

    const { to, subject, body } = await req.json();
    if (!to || !subject || !body)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // queue the email
    const { error } = await supabase.from("send_queue").insert({
      to_email: to,
      subject,
      body,
      workspace_id,
      status: "queued",
      scheduled_at: new Date().toISOString(),
    });

    if (error) throw new Error("Failed to queue");

    await sendNotification(
      "admin@smartsend.ai",
      "system",
      "API Email Queued",
      `Workspace ${workspace_id} queued an email via API`
    );

    return NextResponse.json({ ok: true, message: "Email queued" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}