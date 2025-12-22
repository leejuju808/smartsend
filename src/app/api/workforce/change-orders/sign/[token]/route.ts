// GET /api/workforce/change-orders/sign/[token] - Get change order by signature token
// POST /api/workforce/change-orders/sign/[token] - Sign/approve/reject change order

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = createClient();
    const { token } = await params;

    // Get change order by signature token
    const { data: changeOrder, error } = await supabase
      .from("change_orders")
      .select(`
        *,
        jobs:job_id (
          homeowner_name,
          address
        )
      `)
      .eq("signature_token", token)
      .single();

    if (error || !changeOrder) {
      return NextResponse.json(
        { error: "Change order not found or link expired" },
        { status: 404 }
      );
    }

    // Check if link has expired
    if (changeOrder.signature_link_expires_at) {
      const expiresAt = new Date(changeOrder.signature_link_expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { error: "This signature link has expired" },
          { status: 410 }
        );
      }
    }

    return NextResponse.json({ change_order: changeOrder });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/change-orders/sign/[token]:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = createClient();
    const { token } = await params;
    const body = await req.json();

    // Get change order by signature token
    const { data: changeOrder, error: fetchError } = await supabase
      .from("change_orders")
      .select("*")
      .eq("signature_token", token)
      .single();

    if (fetchError || !changeOrder) {
      return NextResponse.json(
        { error: "Change order not found" },
        { status: 404 }
      );
    }

    // Check if already signed/rejected
    if (changeOrder.status === 'approved' || changeOrder.status === 'signed' || changeOrder.status === 'rejected') {
      return NextResponse.json(
        { error: "This change order has already been processed" },
        { status: 400 }
      );
    }

    // Check if link has expired
    if (changeOrder.signature_link_expires_at) {
      const expiresAt = new Date(changeOrder.signature_link_expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { error: "This signature link has expired" },
          { status: 410 }
        );
      }
    }

    // Update change order based on approval/rejection
    const newStatus = body.approved ? 'approved' : 'rejected';
    const updateData: any = {
      status: newStatus,
      customer_signed_name: body.customer_name || null,
      customer_signed_at: body.approved ? new Date().toISOString() : null,
    };

    if (body.signature_data) {
      updateData.customer_signature_data = body.signature_data;
    }

    // If approved, also set signed_at
    if (body.approved) {
      updateData.signed_at = new Date().toISOString();
    }

    const { data: updatedChangeOrder, error: updateError } = await supabase
      .from("change_orders")
      .update(updateData)
      .eq("id", changeOrder.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating change order:", updateError);
      return NextResponse.json(
        { error: "Failed to process signature" },
        { status: 500 }
      );
    }

    // If approved, the trigger will automatically update the job contract_value
    // (handled by the trigger in the migration)

    return NextResponse.json({ change_order: updatedChangeOrder });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/change-orders/sign/[token]:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























