import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildICS } from "@/lib/calendar";

const Body = z
  .object({
    slot_id: z.string().uuid().optional(),
    start_utc: z.string().datetime().optional(),
    end_utc: z.string().datetime().optional(),
    title: z.string().min(1).default("Intro call"),
    location: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (val) => {
      if (val.slot_id) return true;
      return Boolean(val.start_utc && val.end_utc);
    },
    {
      message: "Provide slot_id or both start_utc and end_utc",
      path: ["slot_id"],
    }
  );

type QueueAttachment = {
  name: string;
  bucket: string;
  path: string;
  content_type?: string;
  kind?: string;
  title?: string;
  location?: string | null;
};

function asAttachments(value: unknown): QueueAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is QueueAttachment => typeof item === "object" && item !== null);
}

const ICS_ATTACHMENT_NAME = "invite.ics";
const ICS_BUCKET = "ics";

export async function POST(req: NextRequest, { params }: { params: { queueId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const p = parsed.data;

  const { data: q, error: queueErr } = await supabase
    .from("send_queue")
    .select(
      "id,campaign_id,lead_id,thread_id,subject,body,attachments,status"
    )
    .eq("id", params.queueId)
    .maybeSingle();

  if (queueErr) {
    return NextResponse.json({ error: queueErr.message }, { status: 500 });
  }

  if (!q) {
    return NextResponse.json({ error: "queue_not_found" }, { status: 404 });
  }

  if (q.status !== "draft") {
    return NextResponse.json({ error: "only_draft_supported" }, { status: 400 });
  }

  const [{ data: lead, error: leadErr }, { data: prefs, error: prefsErr }] = await Promise.all([
    supabase
      .from("leads")
      .select("first_name,last_name,email")
      .eq("id", q.lead_id)
      .maybeSingle(),
    supabase.from("meeting_prefs").select("location").eq("campaign_id", q.campaign_id).maybeSingle(),
  ]);

  if (leadErr) {
    return NextResponse.json({ error: leadErr.message }, { status: 500 });
  }

  if (prefsErr) {
    return NextResponse.json({ error: prefsErr.message }, { status: 500 });
  }

  let start: Date;
  let end: Date;

  if (p.slot_id) {
    const { data: slot, error: slotErr } = await supabase
      .from("meeting_slots")
      .select("start_utc,end_utc")
      .eq("id", p.slot_id)
      .maybeSingle();

    if (slotErr) {
      return NextResponse.json({ error: slotErr.message }, { status: 500 });
    }

    if (!slot) {
      return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
    }

    start = new Date(slot.start_utc);
    end = new Date(slot.end_utc);
  } else {
    start = new Date(p.start_utc!);
    end = new Date(p.end_utc!);
  }

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "invalid_times" }, { status: 400 });
  }

  const title = p.title ?? "Intro call";
  const location = p.location ?? prefs?.location ?? "Google Meet";

  const attendeeName = `${lead?.first_name || ""} ${lead?.last_name || ""}`.trim();
  const ics = buildICS({
    uid: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
    title,
    description: p.notes || "Looking forward to speaking.",
    start,
    end,
    organizer: { name: "SmartSend", email: "noreply@smartsend" },
    attendee: { name: attendeeName, email: lead?.email || "" },
    location,
  });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "missing_supabase_env" }, { status: 500 });
  }

  const sbAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const storageKey = `${q.id}/${ICS_ATTACHMENT_NAME}`;
  const blob = new Blob([ics], { type: "text/calendar" });

  const { error: uploadError } = await sbAdmin.storage.from(ICS_BUCKET).upload(storageKey, blob, {
    upsert: true,
    contentType: "text/calendar",
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const attachment: QueueAttachment = {
    name: ICS_ATTACHMENT_NAME,
    bucket: ICS_BUCKET,
    path: storageKey,
    content_type: "text/calendar; method=REQUEST",
    kind: "calendar_invite",
    title,
    location,
  };

  const existingAttachments = asAttachments(q.attachments);
  const deduped = existingAttachments.filter(
    (a) => !(a.bucket === attachment.bucket && a.path === attachment.path)
  );
  deduped.push(attachment);

  const { data: updated, error: updateErr } = await supabase
    .from("send_queue")
    .update({ attachments: deduped })
    .eq("id", q.id)
    .select("id,attachments")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const { data: signed, error: signedErr } = await sbAdmin.storage.from(ICS_BUCKET).createSignedUrl(storageKey, 60 * 10);

  if (signedErr) {
    // Signed URL is optional, just log and continue
    console.warn("attach-ics signed url error", signedErr);
  }

  return NextResponse.json({
    ok: true,
    attachment,
    preview_url: signed?.signedUrl ?? null,
    queue_id: updated?.id ?? q.id,
  });
}


