import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { format, startOfWeek, endOfWeek } from "date-fns";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const tomorrow = format(new Date(now.getTime() + 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();

  try {
    // 1) Deposits due (today + tomorrow)
    const { data: depositsRaw, error: depError } = await supabase
      .from("job_deposits_due")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("scheduled_start_date", [today, tomorrow]);

    if (depError) {
      console.error(depError);
      return NextResponse.json({ error: depError.message }, { status: 500 });
    }

    const depositsDue = depositsRaw || [];

    // 2) Final balances due: split into dueSoon vs overdue
    const { data: finalsRaw, error: finalError } = await supabase
      .from("job_final_balances_due")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (finalError) {
      console.error(finalError);
      return NextResponse.json({ error: finalError.message }, { status: 500 });
    }

    const finalsDueSoon = (finalsRaw || []).filter((j: any) => {
      if (!j.scheduled_end_date) return false;
      return j.scheduled_end_date <= today;
    });

    const finalsOverdue = (finalsRaw || []).filter((j: any) => {
      if (!j.scheduled_end_date) return false;
      const endDate = new Date(j.scheduled_end_date);
      const todayDate = new Date(today);
      return endDate < todayDate;
    });

    // 3) Payments collected this week
    const { data: paymentsWeek, error: payError } = await supabase
      .from("job_payments_recent")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "received")
      .gte("received_at", weekStartIso)
      .lte("received_at", weekEndIso)
      .order("received_at", { ascending: false });

    if (payError) {
      console.error(payError);
      return NextResponse.json({ error: payError.message }, { status: 500 });
    }

    const totalCollectedWeek = (paymentsWeek || []).reduce(
      (sum: number, p: any) => sum + Number(p.amount || 0),
      0
    );

    const totalDepositsDue = depositsDue.reduce(
      (sum: number, j: any) =>
        sum + (Number(j.deposit_required || 0) - Number(j.deposit_paid || 0)),
      0
    );

    const totalFinalsDue = finalsDueSoon.reduce(
      (sum: number, j: any) => sum + Number(j.balance_remaining || 0),
      0
    );

    const totalFinalsOverdue = finalsOverdue.reduce(
      (sum: number, j: any) => sum + Number(j.balance_remaining || 0),
      0
    );

    const meta = {
      today,
      weekStart: format(weekStart, "yyyy-MM-dd"),
      weekEnd: format(weekEnd, "yyyy-MM-dd"),
      totalCollectedWeek,
      totalDepositsDue,
      totalFinalsDue,
      totalFinalsOverdue,
      depositsCount: depositsDue.length,
      finalsDueCount: finalsDueSoon.length,
      finalsOverdueCount: finalsOverdue.length,
    };

    return NextResponse.json(
      {
        meta,
        depositsDue,
        finalsDueSoon,
        finalsOverdue,
        paymentsWeek: paymentsWeek || [],
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Money today error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































