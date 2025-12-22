// Block 28000 — SmartSend Roofing Warranty & Service Call Engine v1
// Edge Function: Schedule Warranty Check-In Events
// Runs daily to create warranty check-in events for warranties that are due

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req: Request) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    // Calculate dates for different check-in types
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

    let scheduled = 0;
    let errors = 0;

    // 1. Schedule 6-month check-ins
    // Find warranties that started 6 months ago (within a 7-day window to catch them)
    const sixMonthsStart = new Date(sixMonthsAgo);
    sixMonthsStart.setDate(sixMonthsStart.getDate() - 3);
    const sixMonthsEnd = new Date(sixMonthsAgo);
    sixMonthsEnd.setDate(sixMonthsEnd.getDate() + 3);

    const { data: sixMonthWarranties, error: sixMonthError } = await supabase
      .from("roofing_warranties")
      .select("id, warranty_id:roofing_warranty_events!left(id)")
      .gte("start_date", sixMonthsStart.toISOString().slice(0, 10))
      .lte("start_date", sixMonthsEnd.toISOString().slice(0, 10));

    if (sixMonthError) {
      console.error("Error fetching 6-month warranties:", sixMonthError);
      errors++;
    } else if (sixMonthWarranties) {
      for (const warranty of sixMonthWarranties) {
        // Check if event already exists
        const { data: existingEvent } = await supabase
          .from("roofing_warranty_events")
          .select("id")
          .eq("warranty_id", warranty.id)
          .eq("event_type", "6_month_check")
          .eq("due_date", sixMonthsAgoStr)
          .single();

        if (!existingEvent) {
          const { error: insertError } = await supabase
            .from("roofing_warranty_events")
            .insert({
              warranty_id: warranty.id,
              event_type: "6_month_check",
              due_date: sixMonthsAgoStr,
              sent: false,
              completed: false,
            });

          if (insertError) {
            console.error(`Error creating 6-month event for warranty ${warranty.id}:`, insertError);
            errors++;
          } else {
            scheduled++;
          }
        }
      }
    }

    // 2. Schedule annual check-ins
    // Find warranties that started 1 year ago (within a 7-day window)
    const oneYearStart = new Date(oneYearAgo);
    oneYearStart.setDate(oneYearStart.getDate() - 3);
    const oneYearEnd = new Date(oneYearAgo);
    oneYearEnd.setDate(oneYearEnd.getDate() + 3);

    const { data: annualWarranties, error: annualError } = await supabase
      .from("roofing_warranties")
      .select("id")
      .gte("start_date", oneYearStart.toISOString().slice(0, 10))
      .lte("start_date", oneYearEnd.toISOString().slice(0, 10));

    if (annualError) {
      console.error("Error fetching annual warranties:", annualError);
      errors++;
    } else if (annualWarranties) {
      for (const warranty of annualWarranties) {
        // Check if event already exists for this year
        const { data: existingEvent } = await supabase
          .from("roofing_warranty_events")
          .select("id")
          .eq("warranty_id", warranty.id)
          .eq("event_type", "annual_check")
          .eq("due_date", oneYearAgoStr)
          .single();

        if (!existingEvent) {
          const { error: insertError } = await supabase
            .from("roofing_warranty_events")
            .insert({
              warranty_id: warranty.id,
              event_type: "annual_check",
              due_date: oneYearAgoStr,
              sent: false,
              completed: false,
            });

          if (insertError) {
            console.error(`Error creating annual event for warranty ${warranty.id}:`, insertError);
            errors++;
          } else {
            scheduled++;
          }
        }
      }
    }

    // 3. Schedule annual check-ins for subsequent years
    // For warranties older than 1 year, schedule annual check-ins
    const { data: olderWarranties, error: olderError } = await supabase
      .from("roofing_warranties")
      .select("id, start_date")
      .lt("start_date", oneYearAgoStr);

    if (olderError) {
      console.error("Error fetching older warranties:", olderError);
      errors++;
    } else if (olderWarranties) {
      for (const warranty of olderWarranties) {
        // Calculate years since start
        const startDate = new Date(warranty.start_date);
        const yearsSinceStart = Math.floor(
          (today.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        );

        // Schedule annual check-in for each year (but not if we already scheduled one this year)
        if (yearsSinceStart > 0) {
          // Check if we already have an annual check-in for this year
          const thisYearStart = new Date(today.getFullYear(), 0, 1);
          const { data: existingThisYear } = await supabase
            .from("roofing_warranty_events")
            .select("id")
            .eq("warranty_id", warranty.id)
            .eq("event_type", "annual_check")
            .gte("due_date", thisYearStart.toISOString().slice(0, 10))
            .single();

          if (!existingThisYear) {
            // Schedule for today (or the anniversary date if it's close)
            const anniversaryDate = new Date(startDate);
            anniversaryDate.setFullYear(today.getFullYear());
            
            // If anniversary already passed this year, schedule for next year
            if (anniversaryDate < today) {
              anniversaryDate.setFullYear(today.getFullYear() + 1);
            }

            const { error: insertError } = await supabase
              .from("roofing_warranty_events")
              .insert({
                warranty_id: warranty.id,
                event_type: "annual_check",
                due_date: anniversaryDate.toISOString().slice(0, 10),
                sent: false,
                completed: false,
              });

            if (insertError) {
              console.error(`Error creating annual event for warranty ${warranty.id}:`, insertError);
              errors++;
            } else {
              scheduled++;
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scheduled,
        errors,
        message: `Scheduled ${scheduled} warranty check-in events`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in schedule_warranty_events:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});



































