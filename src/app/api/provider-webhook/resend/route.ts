import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Resend sends events like:
 *  - email.sent
 *  - email.delivered
 *  - email.opened
 *  - email.bounced
 *  - email.clicked
 *  - email.complained
 *  Body example includes { id, type, data: { email_id, to, tags, ... } }
 */

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => cookieStore }
  );

  try {
    const payload = await req.json();
    const type = payload?.type as string | undefined;
    const data = payload?.data || {};
    const providerId = data?.email_id || data?.id || null;
    const toEmail = (data?.to && Array.isArray(data.to) ? data.to[0] : data?.to) ?? null;

    // If you tagged your original send with queue_id in provider metadata,
    // attach it here. If not, you can look it up by providerId if you store it when sending.
    // Example (better): data.tags = [{ name: "queue_id", value: "..." }]
    const queueId = (data?.tags || []).find((t: any) => t?.name === "queue_id")?.value ?? null;

    // Map provider event -> our fields
    const eventMap: Record<string, { status?: string; delivered?: boolean; opened?: boolean }> = {
      "email.sent": { status: "sent" },
      "email.delivered": { status: "delivered", delivered: true },
      "email.opened": { status: "opened", opened: true },
      "email.bounced": { status: "bounced" },
      "email.clicked": { status: "clicked" },
      "email.complained": { status: "complained" },
    };
    const map = type ? eventMap[type] : undefined;

    // Update queue row if we can find it
    if (queueId && map) {
      const patch: any = { provider_status: map.status, updated_at: new Date().toISOString() };
      if (map.delivered) patch.delivered_at = new Date().toISOString();
      if (map.opened) patch.opened_at = new Date().toISOString();
      // Best-effort status ladder for v1: queued → sent → delivered
      if (map.status === "delivered") patch.status = "delivered";

      await supabase.from("send_queue").update(patch).eq("id", queueId);
    }

    // Always log
    await supabase.from("send_logs").insert({
      queue_id: queueId,
      to_email: toEmail,
      provider_id: providerId,
      status: map?.status ?? type ?? "unknown",
      event: type ?? "unknown",
      meta: payload,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}