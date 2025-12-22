// Block 228000 — Update Payment Schedule When Change Order Approved
// POST /api/change-orders/update-payment-schedule
// Automatically updates payment schedule when change order is approved

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { change_order_id } = await req.json();

    if (!change_order_id) {
      return NextResponse.json(
        { error: "change_order_id is required" },
        { status: 400 }
      );
    }

    // Get change order
    const { data: changeOrder, error: coError } = await supabase
      .from("change_orders")
      .select("*")
      .eq("id", change_order_id)
      .single();

    if (coError || !changeOrder) {
      return NextResponse.json(
        { error: "Change order not found" },
        { status: 404 }
      );
    }

    if (changeOrder.status !== "approved") {
      return NextResponse.json(
        { error: "Change order must be approved to update payment schedule" },
        { status: 400 }
      );
    }

    // Find payment schedule for this job
    const { data: schedule, error: scheduleError } = await supabase
      .from("payment_schedules")
      .select("*")
      .eq("job_id", changeOrder.job_id)
      .eq("status", "active")
      .single();

    if (scheduleError || !schedule) {
      // No payment schedule exists - this is OK, schedule might be created later
      return NextResponse.json({
        success: true,
        message: "No active payment schedule found. Job value updated by trigger.",
      });
    }

    // Get current total and milestones
    const { data: milestones, error: milestonesError } = await supabase
      .from("payment_milestones")
      .select("*")
      .eq("schedule_id", schedule.id)
      .order("milestone_order", { ascending: true });

    if (milestonesError) {
      console.error("Error fetching milestones:", milestonesError);
      return NextResponse.json(
        { error: "Failed to fetch payment milestones" },
        { status: 500 }
      );
    }

    // Calculate new total
    const new_total = Number(schedule.total_amount) + Number(changeOrder.added_cost);

    // Update payment schedule total
    const { error: updateScheduleError } = await supabase
      .from("payment_schedules")
      .update({
        total_amount: new_total,
        updated_at: new Date().toISOString(),
      })
      .eq("id", schedule.id);

    if (updateScheduleError) {
      console.error("Error updating schedule:", updateScheduleError);
      return NextResponse.json(
        { error: "Failed to update payment schedule" },
        { status: 500 }
      );
    }

    // Recalculate milestone amounts proportionally
    // Keep percentages the same, but increase amounts
    if (milestones && milestones.length > 0) {
      const totalOldAmount = milestones.reduce((sum, m) => sum + Number(m.amount || 0), 0);
      
      if (totalOldAmount > 0) {
        const updates = milestones.map(milestone => {
          const percentage = Number(milestone.percentage || 0);
          let newAmount: number;

          if (percentage > 0) {
            // Use percentage to calculate new amount
            newAmount = (new_total * percentage) / 100;
          } else {
            // Calculate proportionally based on old amount
            const proportion = Number(milestone.amount) / totalOldAmount;
            newAmount = new_total * proportion;
          }

          return supabase
            .from("payment_milestones")
            .update({
              amount: Math.round(newAmount * 100) / 100, // Round to 2 decimals
              updated_at: new Date().toISOString(),
            })
            .eq("id", milestone.id);
        });

        // Execute all updates
        await Promise.all(updates);
      }
    }

    return NextResponse.json({
      success: true,
      schedule_id: schedule.id,
      old_total: schedule.total_amount,
      new_total,
      added_cost: changeOrder.added_cost,
      message: "Payment schedule updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating payment schedule:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update payment schedule" },
      { status: 500 }
    );
  }
}

























