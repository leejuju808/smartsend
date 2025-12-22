import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/payments/schedule/create
 * Creates a payment schedule from a contract
 * 
 * Input: { contract_id, total_amount, structure: ["30", "40", "30"] }
 * Output: { schedule_id, schedule, milestones }
 */
export async function POST(req: NextRequest) {
  try {
    const { contract_id, total_amount, structure } = await req.json();

    if (!contract_id || !total_amount) {
      return NextResponse.json(
        { error: "contract_id and total_amount are required" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Verify contract exists and user has access
    const { data: contract, error: contractError } = await supabase
      .from("contract_documents")
      .select("id, workspace_id, job_id, homeowner_id, lead_id")
      .eq("id", contract_id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    // Use default structure if not provided: 30% deposit, 40% progress, 30% final
    const paymentStructure = structure || ["30", "40", "30"];

    // Validate structure percentages sum to 100
    const totalPercentage = paymentStructure.reduce(
      (sum: number, p: string) => sum + parseFloat(p),
      0
    );
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return NextResponse.json(
        { error: "Payment structure percentages must sum to 100" },
        { status: 400 }
      );
    }

    // Create payment schedule using database function
    const { data: scheduleId, error: scheduleError } = await supabase.rpc(
      "create_payment_schedule_from_contract",
      {
        p_contract_id: contract_id,
        p_total_amount: parseFloat(total_amount),
        p_structure: paymentStructure,
      }
    );

    if (scheduleError) {
      console.error("Error creating payment schedule:", scheduleError);
      return NextResponse.json(
        { error: "Failed to create payment schedule", details: scheduleError.message },
        { status: 500 }
      );
    }

    // Fetch the created schedule with milestones
    const { data: schedule, error: fetchError } = await supabase
      .from("payment_schedules")
      .select(`
        *,
        payment_milestones (*)
      `)
      .eq("id", scheduleId)
      .single();

    if (fetchError || !schedule) {
      return NextResponse.json(
        { error: "Failed to fetch created schedule" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      schedule_id: scheduleId,
      schedule,
      milestones: schedule.payment_milestones,
    });
  } catch (error: any) {
    console.error("Error in create payment schedule:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























