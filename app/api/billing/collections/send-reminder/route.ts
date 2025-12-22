import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/billing/collections/send-reminder
 * Send a collections reminder for an invoice
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { invoice_id, message, channel = "email" } = body;

    if (!invoice_id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Verify invoice exists and belongs to workspace
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, invoice_number, balance, due_date, status")
      .eq("id", invoice_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Determine event type based on days overdue
    const daysOverdue = Math.floor(
      (new Date().getTime() - new Date(invoice.due_date).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    let eventType = "reminder_sent";
    if (daysOverdue >= 10) {
      eventType = "escalation";
    } else if (daysOverdue >= 3) {
      eventType = "overdue_notice";
    }

    // Default message if not provided
    const defaultMessage =
      daysOverdue > 0
        ? `Your invoice #${invoice.invoice_number} is ${daysOverdue} day${
            daysOverdue !== 1 ? "s" : ""
          } overdue. Please complete your payment of $${invoice.balance.toFixed(
            2
          )}.`
        : `Your invoice #${invoice.invoice_number} is now due. Please complete your payment of $${invoice.balance.toFixed(
            2
          )}.`;

    // Create collections event
    const { data: event, error: eventError } = await supabase
      .from("collections_events")
      .insert({
        invoice_id,
        workspace_id,
        event_type: eventType,
        message: message || defaultMessage,
        channel,
        automated: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (eventError) {
      console.error("Error creating collections event:", eventError);
      return NextResponse.json(
        { error: "Failed to create collections event", details: eventError.message },
        { status: 500 }
      );
    }

    // TODO: Actually send the email/SMS here
    // This would integrate with your email/SMS sending system

    return NextResponse.json({ event });
  } catch (error: any) {
    console.error("Error in POST /api/billing/collections/send-reminder:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}






















