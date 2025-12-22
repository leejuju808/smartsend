"use server";

import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
    }
  );

export async function bookWithAI({ message_id }: { message_id: string }) {
  try {
    // Pull minimal message info needed by /api/reply-intent
    const sb = supabase();
    const { data: msg, error: e1 } = await sb
      .from("messages")
      .select("id, body_text, sender_email")
      .eq("id", message_id)
      .single();

    if (e1 || !msg) throw new Error(e1?.message || "Message not found");

    // Call your previously built AI booking endpoint
    const origin = headers().get("origin") || "";
    const res = await fetch(`${origin}/api/reply-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        reply_text: msg.body_text,
        recipient_email: msg.sender_email,
        message_id: msg.id,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || "AI booking failed");
    }

    const json = await res.json();

    // Look up the newly created meeting for this message
    const { data: mt, error: e2 } = await sb
      .from("meetings")
      .select("id, calendly_url")
      .eq("message_id", message_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (e2) throw new Error(e2.message);

    return {
      ok: true,
      meeting_id: mt?.id ?? null,
      calendly_url: mt?.calendly_url ?? json?.calendlyUrl ?? null,
    };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function markBooked({ message_id }: { message_id: string }) {
  try {
    const sb = supabase();

    // Get sender_email to attach as the attendee
    const { data: msg, error: e1 } = await sb
      .from("messages")
      .select("sender_email")
      .eq("id", message_id)
      .single();
    if (e1 || !msg) throw new Error(e1?.message || "Message not found");

    const { data, error } = await sb
      .from("meetings")
      .insert({
        message_id,
        recipient_email: msg.sender_email,
        status: "booked",
        calendly_url: null,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return { ok: true, meeting_id: data.id, calendly_url: null };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}