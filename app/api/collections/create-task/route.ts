// Block 26200 — Collections API: Create Call Task
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { invoice_id, job_id, workspace_id, title, priority = "medium" } =
      await req.json();

    if (!invoice_id || !workspace_id || !title) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get invoice details for description
    const { data: invoice } = await supabase
      .from("roofing_invoice_balances")
      .select("*")
      .eq("invoice_id", invoice_id)
      .single();

    const description = invoice
      ? `Invoice ${invoice.invoice_number || invoice.invoice_id.slice(0, 8)}: Balance $${Number(invoice.balance_due).toFixed(2)} due ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "ASAP"}`
      : `Follow up on invoice ${invoice_id}`;

    // Create task (try tasks table first, fallback to tasks_v3 if needed)
    const { error: taskError } = await supabase.from("tasks").insert({
      workspace_id,
      lead_id: job_id ? null : null, // Will be set from job if available
      title,
      description,
      status: "todo",
      due_date: invoice?.due_date || new Date().toISOString().split("T")[0],
      type: "collections_call",
      priority,
      metadata: {
        invoice_id,
        job_id,
        balance_due: invoice?.balance_due,
      },
    });

    if (taskError) {
      // Try tasks_v3 if tasks table doesn't work
      const { error: taskV3Error } = await supabase.from("tasks_v3").insert({
        workspace_id,
        lead_id: job_id ? null : null,
        task_type: "collections_call" as any,
        title,
        description,
        status: "open",
        due_at: invoice?.due_date
          ? new Date(invoice.due_date).toISOString()
          : new Date().toISOString(),
        due_date: invoice?.due_date || new Date().toISOString().split("T")[0],
        priority: priority as any,
        metadata: {
          invoice_id,
          job_id,
          balance_due: invoice?.balance_due,
        },
        auto_generated: true,
        auto_source: "collections",
      });

      if (taskV3Error) {
        return NextResponse.json(
          { error: taskV3Error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































