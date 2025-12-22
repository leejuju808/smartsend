import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Naive parser for common patterns; swap in LLM if low confidence
function parseMeeting(text: string) {
  const t = text.toLowerCase();
  const hasIntent = /(meet|call|chat|schedule|book|set up)/.test(t);
  if (!hasIntent) return { ok: false };

  // Detect duration
  let duration = 30;
  const durationMatch = t.match(/\b(45|60)\s?(min|minutes)\b/);
  if (durationMatch) {
    duration = parseInt(durationMatch[1], 10);
  }

  // Time like "10am", "14:30", "3 pm"
  const time = t.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)?\b/);
  // Date like "Nov 28", "11/30", "Monday"
  const monthName = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i);
  const md = t.match(/\b(\d{1,2})[\/\-](\d{1,2})([\/\-](\d{2,4}))?\b/);
  const weekday = t.match(/\b(mon|tue|wed|thu|thur|fri|sat|sun)[a-z]*\b/i);

  if (!(time && (monthName || md || weekday))) {
    return { ok: true, confidence: 0.55, when: null, duration };
  }

  const now = new Date();
  let yyyy = now.getFullYear();
  let mm = now.getMonth();
  let dd = now.getDate();

  if (monthName) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
    };
    const monthKey = monthName[1].slice(0, 3).toLowerCase();
    mm = months[monthKey] ?? mm;
    dd = parseInt(monthName[2], 10);
  } else if (md) {
    mm = parseInt(md[1], 10) - 1;
    dd = parseInt(md[2], 10);
    if (md[3]) {
      const y = parseInt(md[3].replace(/[^\d]/g, ''), 10);
      yyyy = y < 100 ? 2000 + y : y;
    }
  } else if (weekday) {
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const target = days.indexOf(weekday[1].slice(0, 3).toLowerCase());
    if (target !== -1) {
      const diff = (target - now.getDay() + 7) % 7 || 7;
      const future = new Date(now);
      future.setDate(now.getDate() + diff);
      yyyy = future.getFullYear();
      mm = future.getMonth();
      dd = future.getDate();
    }
  }

  const hh = parseInt(time[1], 10);
  const mi = time[2] ? parseInt(time[2], 10) : 0;
  const ap = time[3];
  let H = hh;
  if (ap) {
    if (ap === 'pm' && hh < 12) H = hh + 12;
    if (ap === 'am' && hh === 12) H = 0;
  }

  const start = new Date(Date.UTC(yyyy, mm, dd, H, mi, 0));
  const end = new Date(start);
  end.setMinutes(start.getMinutes() + duration);

  return { ok: true, confidence: 0.8, when: { start, end }, duration };
}

serve(async (req) => {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { reply_id } = await req.json();

    if (!reply_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "reply_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch reply with campaign and contact info
    const { data: r, error: replyError } = await sb
      .from("replies")
      .select("id, campaign_id, contact_id, reply_text, body_text, body")
      .eq("id", reply_id)
      .single();

    if (replyError || !r) {
      return new Response(
        JSON.stringify({ ok: false, error: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use reply_text, fallback to body_text or body
    const replyText = r.reply_text || r.body_text || r.body || "";

    // Safety checks: unsub/bounce/OOO first (priority over meeting intent)
    const lowerText = replyText.toLowerCase();
    
    // Check for unsubscribe
    if (/(unsubscribe|opt.?out|remove|stop|don't email)/.test(lowerText)) {
      return new Response(
        JSON.stringify({ ok: true, has_intent: false, reason: "unsub_detected" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Check for bounce indicators
    if (/(bounce|undeliverable|delivery failure|mailbox full)/.test(lowerText)) {
      return new Response(
        JSON.stringify({ ok: true, has_intent: false, reason: "bounce_detected" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Check for OOO (out of office) - prefer OOO pause over meeting booking
    const isOOO = /(out of office|ooo|away|vacation|on leave|out until)/.test(lowerText);
    
    let parsed = parseMeeting(replyText);
    
    // If OOO detected, don't extract meeting intent
    if (isOOO && parsed.ok) {
      return new Response(
        JSON.stringify({ ok: true, has_intent: false, reason: "ooo_detected" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Optionally LLM refine if confidence < 0.75
    // TODO: Add LLM call here if needed

    if (!parsed.ok) {
      return new Response(
        JSON.stringify({ ok: true, has_intent: false }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Ensure we have campaign_id and contact_id
    if (!r.campaign_id || !r.contact_id) {
      // Try to resolve from lead_id if contact_id is missing
      if (!r.contact_id) {
        const { data: lead } = await sb
          .from("leads")
          .select("id, campaign_id")
          .eq("id", (r as any).lead_id)
          .single();
        
        if (lead) {
          // Try to find contact by email
          const { data: contact } = await sb
            .from("contacts")
            .select("id")
            .eq("email", (r as any).from_email)
            .limit(1)
            .single();
          
          if (contact && !r.contact_id) {
            await sb
              .from("replies")
              .update({ contact_id: contact.id })
              .eq("id", reply_id);
            (r as any).contact_id = contact.id;
          }
        }
      }
    }

    if (!r.campaign_id || !r.contact_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_campaign_or_contact" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update message_outcomes if there's a matching message_id, otherwise insert
    // Note: message_outcomes uses message_id as primary key, so we can't upsert with null
    // Instead, we'll try to find existing outcomes for this campaign/contact and update them
    const { data: existingOutcomes } = await sb
      .from("message_outcomes")
      .select("message_id")
      .eq("campaign_id", r.campaign_id)
      .eq("contact_id", r.contact_id)
      .limit(1)
      .maybeSingle();

    if (existingOutcomes) {
      await sb
        .from("message_outcomes")
        .update({ meeting_intent: parsed.when ? true : false })
        .eq("message_id", existingOutcomes.message_id);
    } else {
      // If no existing outcome, we can't create one without a message_id
      // This is fine - the meeting_intent flag will be set when a message is sent
    }

    // Safety: Confidence threshold check
    const confidence = parsed.confidence ?? 0.6;
    const confidenceThreshold = 0.70; // Below this, mark as "needs review"
    
    // Create proposed intent row
    const { data: intent, error: intentError } = await sb
      .from("meeting_intents")
      .insert({
        campaign_id: r.campaign_id,
        contact_id: r.contact_id,
        reply_id: r.id,
        intent_confidence: confidence,
        text_excerpt: replyText.slice(0, 280),
        start_ts: parsed.when ? parsed.when.start.toISOString() : null,
        end_ts: parsed.when ? parsed.when.end.toISOString() : null,
        duration_min: parsed.duration ?? 30,
        timezone: null,
        status: confidence < confidenceThreshold ? 'proposed' : 'proposed', // Both are proposed, but UI will show "Needs review" if confidence < threshold
        notes: confidence < confidenceThreshold ? 'Low confidence - needs review' : null
      })
      .select("id")
      .single();

    if (intentError) {
      console.error("Error creating meeting intent:", intentError);
      return new Response(
        JSON.stringify({ ok: false, error: intentError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        has_intent: true,
        intent_id: intent?.id,
        confidence: parsed.confidence
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in meeting-intent-extract:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

