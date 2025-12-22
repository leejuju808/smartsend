// File: app/api/webhooks/calendly/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Calendly webhooks send event payloads such as invitee.created, invitee.canceled.
 * We'll accept JSON, optionally verify signature if CALENDLY_SIGNING_SECRET is set,
 * and insert/update `public.meetings`.
 *
 * Important: we map the event to a user via inbound_routes.to_email that matches
 * the organizer or event "assigned_to" address you use for SmartSend.
 */

const sbAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

function verifySignature(raw: string, header?: string, secret?: string) {
  if (!secret) return true; // dev mode: skip verification
  if (!header) return false;

  // Calendly v2 typically sends: "t=timestamp,v1=signature"
  // We'll compute HMAC-SHA256(raw, secret) and compare to v1.
  const parts = header.split(",").map((p) => p.trim());
  const sigPart = parts.find((p) => p.startsWith("v1="));
  if (!sigPart) return false;
  const provided = sigPart.replace("v1=", "");

  const hmac = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(provided));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();

  const ok = verifySignature(
    raw,
    req.headers.get("Calendly-Webhook-Signature") || req.headers.get("Calendly-Signature") || undefined,
    process.env.CALENDLY_SIGNING_SECRET
  );
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(raw);

    // Extract minimal fields with sane fallbacks
    const event = payload?.event ?? payload?.event_type ?? payload?.trigger ?? "unknown";
    const resource = payload?.payload || payload?.resource || payload?.data || {};

    // Common fields
    const external_event_id =
      resource?.event?.uuid || resource?.uuid || resource?.event_uuid || null;

    const invitee_email =
      resource?.invitee?.email ||
      resource?.invitee_email ||
      resource?.email ||
      null;

    const invitee_name =
      resource?.invitee?.name ||
      resource?.invitee_name ||
      resource?.name ||
      null;

    const status =
      event.includes("canceled") || resource?.status === "canceled" ? "canceled" : "active";

    // When does it happen?
    const starts_at =
      resource?.event?.start_time ||
      resource?.start_time ||
      resource?.scheduled_event?.start_time ||
      null;

    const ends_at =
      resource?.event?.end_time ||
      resource?.end_time ||
      resource?.scheduled_event?.end_time ||
      null;

    // Which user/workspace? We try these options:
    // 1) payload.organizer.email or resource.organizer.email
    // 2) event.assigned_to array (Calendly) - pick first email
    const organizerEmail =
      payload?.payload?.event?.organizer_email ||
      resource?.event?.organizer_email ||
      (Array.isArray(resource?.event?.assigned_to) ? resource.event.assigned_to[0] : null) ||
      payload?.organizer?.email ||
      resource?.organizer?.email ||
      null;

    const sb = sbAdmin();

    // Resolve user_id from inbound_routes.to_email == organizerEmail
    let userId: string | null = null;
    if (organizerEmail) {
      const { data: routes } = await sb
        .from("inbound_routes")
        .select("user_id, to_email")
        .eq("to_email", organizerEmail)
        .limit(1);
      if (routes && routes.length > 0) {
        userId = routes[0].user_id;
      }
    }

    // If not resolved, optionally accept ?user_id=... for manual tests (do not expose in prod UI)
    if (!userId) {
      const url = new URL(req.url);
      const qsUser = url.searchParams.get("user_id");
      if (qsUser) userId = qsUser;
    }

    if (!userId) {
      // Store anyway with null; you can backfill later.
      const { error: insErr } = await sb.from("meetings").insert([
        {
          user_id: "00000000-0000-0000-0000-000000000000", // placeholder won't pass RLS, but service role can insert
          source: "calendly",
          external_event_id,
          invitee_email,
          invitee_name,
          status,
          starts_at: starts_at ? new Date(starts_at).toISOString() : null,
          ends_at: ends_at ? new Date(ends_at).toISOString() : null,
          raw: payload,
        } as any,
      ]);
      if (insErr) {
        // Fallback: swallow error but return accepted so Calendly doesn't keep retrying.
        console.error("Meeting insert (no user) failed:", insErr.message);
      }
      return NextResponse.json({ ok: true, note: "No user route found; stored raw." }, { status: 202 });
    }

    // Insert or upsert meeting
    const { data: existing } = await sb
      .from("meetings")
      .select("id")
      .eq("user_id", userId)
      .eq("external_event_id", external_event_id)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error: upErr } = await sb
        .from("meetings")
        .update({
          status,
          starts_at: starts_at ? new Date(starts_at).toISOString() : null,
          ends_at: ends_at ? new Date(ends_at).toISOString() : null,
          raw: payload,
        })
        .eq("id", existing[0].id);
      if (upErr) throw upErr;
    } else {
      const { error: insErr } = await sb.from("meetings").insert([
        {
          user_id: userId,
          source: "calendly",
          external_event_id,
          invitee_email,
          invitee_name,
          status,
          starts_at: starts_at ? new Date(starts_at).toISOString() : null,
          ends_at: ends_at ? new Date(ends_at).toISOString() : null,
          raw: payload,
        },
      ]);
      if (insErr) throw insErr;
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
