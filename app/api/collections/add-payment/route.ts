// Block 26200 — Collections API: Add Payment
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { invoice_id, amount, method = "manual", received_date } = await req.json();

    if (!invoice_id || !amount) {
      return NextResponse.json(
        { error: "Missing invoice_id or amount" },
        { status: 400 }
      );
    }

    // Insert payment
    const { error: paymentError } = await supabase
      .from("roofing_payments")
      .insert({
        invoice_id,
        amount: parseFloat(amount),
        method,
        received_date: received_date || new Date().toISOString().split("T")[0],
      });

    if (paymentError) {
      return NextResponse.json(
        { error: paymentError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error adding payment:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































