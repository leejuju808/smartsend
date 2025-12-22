import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const intentId = params.id;

  const { data: mi, error: fetchError } = await supabase
    .from("meeting_intents")
    .select("id, campaign_id, contact_id, reply_id, start_ts, end_ts, timezone, duration_min")
    .eq("id", intentId)
    .single();

  if (fetchError || !mi) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!mi.start_ts || !mi.end_ts) {
    // If no time parsed, use duration_min to calculate end_ts
    const start = new Date(mi.start_ts || new Date().toISOString());
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + (mi.duration_min || 30));
    mi.end_ts = end.toISOString();
    if (!mi.start_ts) {
      mi.start_ts = start.toISOString();
    }
  }

  // TODO: Create calendar event via your chosen provider and get video_link
  // For now, placeholder
  const video_link = null; // placeholder - integrate with Google/Outlook/Zoom/Calendly

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  const { data: meet, error: insertError } = await supabase
    .from("meetings")
    .insert({
      campaign_id: mi.campaign_id,
      contact_id: mi.contact_id,
      booked_by: user?.id || null,
      title: "Intro call",
      start_ts: mi.start_ts,
      end_ts: mi.end_ts,
      timezone: mi.timezone,
      location: "Google Meet", // TODO: detect from integration
      video_link,
      source: "inbox",
      reply_id: mi.reply_id || null,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Update intent status to booked
  await supabase
    .from("meeting_intents")
    .update({ status: "booked" })
    .eq("id", intentId);

  // Cancel future sends for this contact (stop sequence)
  await supabase.rpc("cancel_future_sends_for_contact", {
    p_campaign_id: mi.campaign_id,
    p_contact_id: mi.contact_id,
    p_reason: "meeting",
  });

  // Update campaign_contacts stop_reason
  await supabase
    .from("campaign_contacts")
    .update({ stop_reason: "meeting" })
    .eq("campaign_id", mi.campaign_id)
    .eq("contact_id", mi.contact_id);

  return NextResponse.json({
    ok: true,
    meeting_id: meet.id,
    video_link,
    intent_id: intentId,
  });
}

