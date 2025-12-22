// Block 28844 — SmartSend Quote Revival Engine
// Edge Function: Schedule Quote Revival Sequence
// Automatically schedules revival messages for stalled quotes

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // First, detect stalled quotes
    await supabase.rpc("detect_stalled_quotes");

    // Get all stalled quotes that don't have revival events scheduled yet
    const { data: stalledQuotes, error: quotesError } = await supabase
      .from("quotes")
      .select(`
        id,
        lead_id,
        sent_at,
        total,
        leads:lead_id (
          id,
          email,
          phone,
          first_name,
          last_name,
          workspace_id
        )
      `)
      .eq("status", "stalled")
      .not("sent_at", "is", null);

    if (quotesError) {
      console.error("Error fetching stalled quotes:", quotesError);
      return new Response(
        JSON.stringify({ error: quotesError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!stalledQuotes || stalledQuotes.length === 0) {
      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: "No stalled quotes to process",
          scheduled: 0 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let scheduledCount = 0;

    for (const quote of stalledQuotes) {
      // Check if revival events already exist for this quote
      const { data: existingEvents } = await supabase
        .from("revival_events")
        .select("id")
        .eq("quote_id", quote.id)
        .limit(1);

      if (existingEvents && existingEvents.length > 0) {
        // Already scheduled, skip
        continue;
      }

      // Calculate base date (when quote was sent)
      const sentAt = new Date(quote.sent_at);
      const now = new Date();

      // Schedule revival sequence:
      // Day 3: Quick check-in
      // Day 6: Offer to rework numbers
      // Day 9: Price drop offer (if enabled)
      // Day 14: Final check-in
      const messages = [
        { type: "check_in_3", delayDays: 3 },
        { type: "check_in_6", delayDays: 6 },
        { type: "offer", delayDays: 9 },
        { type: "final", delayDays: 14 },
      ];

      const revivalEvents = [];

      for (const msg of messages) {
        const scheduledDate = new Date(sentAt);
        scheduledDate.setDate(sentAt.getDate() + msg.delayDays);

        // Only schedule if the scheduled date hasn't passed
        if (scheduledDate > now) {
          revivalEvents.push({
            quote_id: quote.id,
            type: msg.type,
            status: "scheduled",
            scheduled_at: scheduledDate.toISOString(),
          });
        }
      }

      if (revivalEvents.length > 0) {
        const { error: insertError } = await supabase
          .from("revival_events")
          .insert(revivalEvents);

        if (insertError) {
          console.error(`Error scheduling revival for quote ${quote.id}:`, insertError);
        } else {
          scheduledCount += revivalEvents.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        stalled_quotes: stalledQuotes.length,
        scheduled_events: scheduledCount,
        message: `Scheduled ${scheduledCount} revival events for ${stalledQuotes.length} stalled quotes`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


































