import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Webhook } from "svix";

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET!;

export const runtime = "nodejs"; // required for crypto

export async function POST(req: Request) {
  const hdrs = new Headers(await headers());
  const svixId = hdrs.get("svix-id");
  const svixTimestamp = hdrs.get("svix-timestamp");
  const svixSignature = hdrs.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature || !WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "Missing signature headers" }, { status: 400 });
  }

  const payload = await req.text();

  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    const evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature
    }) as any;

    const supabase = createRouteHandlerClient({ cookies });

    // Common fields
    const messageId: string | undefined = evt?.data?.id || evt?.data?.message?.id;
    const toEmail: string | undefined =
      evt?.data?.to || evt?.data?.message?.to?.[0] || evt?.data?.recipient;

    // Try find job via provider_message_id first, then fallback by to/subject (last 24h)
    let jobId: string | null = null;

    if (messageId) {
      const { data } = await supabase
        .from("email_jobs")
        .select("id")
        .eq("provider_message_id", messageId)
        .limit(1)
        .single();
      jobId = data?.id ?? null;
    }

    if (!jobId && toEmail) {
      const { data } = await supabase
        .from("email_jobs")
        .select("id")
        .eq("to_email", toEmail)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      jobId = (data as any)?.id ?? null;
    }

    const eventType = evt?.type as
      | "email.sent" | "email.delivered" | "email.bounced" | "email.opened" | "email.clicked";

    // Map provider event -> our statuses/columns
    const updates: Record<string, any> = {};
    if (eventType === "email.delivered") updates.delivered_at = new Date().toISOString();
    if (eventType === "email.bounced") updates.bounced_at = new Date().toISOString();

    if (Object.keys(updates).length && jobId) {
      await supabase.from("email_jobs").update(updates).eq("id", jobId);
    }

    if (jobId) {
      await supabase.from("email_events").insert({
        job_id: jobId,
        event_type:
          eventType === "email.sent" ? "sent" :
          eventType === "email.delivered" ? "delivered" :
          eventType === "email.bounced" ? "bounced" :
          eventType === "email.opened" ? "opened" :
          eventType === "email.clicked" ? "clicked" : "sent",
        payload: JSON.parse(payload)
      });

      // Handle sequence advancement based on email events
      if (eventType === "email.opened" || eventType === "email.clicked" || eventType === "email.bounced" || eventType === "email.delivered") {
        // find enrollment tied to this job
        const { data: enr } = await supabase
          .from("sequence_enrollments")
          .select("id, status, last_job_id, sequence_id")
          .eq("last_job_id", jobId)
          .eq("status", "active")
          .maybeSingle();

        if (enr) {
          const ev = eventType === "email.clicked" ? "clicked"
                   : eventType === "email.opened" ? "opened"
                   : eventType === "email.bounced" ? "bounced"
                   : "delivered";

          // Set last_event and fast-forward to now for rule evaluation
          await supabase.from("sequence_enrollments").update({
            last_event: ev,
            next_scheduled_at: new Date().toISOString()
          }).eq("id", enr.id);
        }
      }

      // ----- Sequence exits/goals -----
      if (jobId) {
        // Get enrollment tied to this job (optional: if you store enrollment_id on jobs; else fallback by to_email)
        const { data: enrByJob } = await supabase
          .from("sequence_enrollments")
          .select("id, sequence_id, status, first_opened_at, first_clicked_at")
          .eq("last_job_id", jobId)
          .maybeSingle();

        // Fallback: try by to_email (last active)
        let enr = enrByJob;
        if (!enr && toEmail) {
          const { data: enrByEmail } = await supabase
            .from("sequence_enrollments")
            .select("id, sequence_id, status, first_opened_at, first_clicked_at")
            .eq("status", "active")
            .eq("to_email", String(toEmail).toLowerCase())
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          enr = enrByEmail;
        }

        if (enr) {
          const ev = eventType === "email.clicked" ? "clicked"
                   : eventType === "email.opened" ? "opened"
                   : eventType === "email.bounced" ? "bounced" : null;

          // Stamp first open/click
          const updates: any = {};
          if (ev === "opened" && !enr.first_opened_at) updates.first_opened_at = new Date().toISOString();
          if (ev === "clicked" && !enr.first_clicked_at) updates.first_clicked_at = new Date().toISOString();

          // Check sequence-level exits/goals
          const { data: seq } = await supabase
            .from("sequences")
            .select("exit_on_bounce, goal_on_click, goal_on_open")
            .eq("id", enr.sequence_id).single();

          // Bounce -> stop
          if (ev === "bounced" && seq?.exit_on_bounce) {
            updates.status = "stopped";
            updates.last_event = "bounced";
            updates.next_scheduled_at = null;
            updates.completed_at = new Date().toISOString();
          }

          // Goal on click/open -> completed
          if (ev === "clicked" && seq?.goal_on_click) {
            updates.status = "completed";
            updates.last_event = "clicked";
            updates.next_scheduled_at = null;
            updates.completed_at = new Date().toISOString();
          } else if (ev === "opened" && seq?.goal_on_open) {
            updates.status = "completed";
            updates.last_event = "opened";
            updates.next_scheduled_at = null;
            updates.completed_at = new Date().toISOString();
          }

          if (Object.keys(updates).length) {
            await supabase.from("sequence_enrollments").update(updates).eq("id", enr.id);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "verify failed" }, { status: 400 });
  }
}