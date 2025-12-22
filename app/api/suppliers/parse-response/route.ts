// Block 24340 — Supplier Communication Engine
// API Route: Parse Supplier Response (AI-powered)
// POST /api/suppliers/parse-response

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { communication_id, response_text } = body;

    if (!communication_id || !response_text) {
      return NextResponse.json(
        { error: "Missing communication_id or response_text" },
        { status: 400 }
      );
    }

    // Get communication record
    const { data: comm, error: commError } = await supabase
      .from("supplier_communications")
      .select(`
        *,
        material_orders (*),
        suppliers (*),
        roofing_jobs (*)
      `)
      .eq("id", communication_id)
      .single();

    if (commError || !comm) {
      return NextResponse.json(
        { error: "Communication not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", comm.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Use AI to parse the response
    // For now, we'll do basic keyword matching
    // In production, this should use OpenAI/Claude to extract structured data
    
    const responseLower = response_text.toLowerCase();
    
    // Extract confirmation status
    const isConfirmed = 
      responseLower.includes("confirmed") ||
      responseLower.includes("yes") ||
      responseLower.includes("will deliver") ||
      responseLower.includes("scheduled");

    // Extract ETA
    const etaMatch = response_text.match(/(?:eta|delivery|arriving|scheduled).*?(\d{1,2}[:\s]*(?:am|pm)?)/i);
    const eta = etaMatch ? etaMatch[1] : null;

    // Extract delivery date
    const dateMatch = response_text.match(/(?:delivery|arriving|scheduled).*?(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+day|\d{1,2}\s+\w+)/i);
    const deliveryDate = dateMatch ? dateMatch[1] : null;

    // Detect issues mentioned
    const issues: string[] = [];
    if (responseLower.includes("wrong color") || responseLower.includes("color mismatch")) {
      issues.push("wrong_color");
    }
    if (responseLower.includes("missing") || responseLower.includes("short")) {
      issues.push("missing_item");
    }
    if (responseLower.includes("delay") || responseLower.includes("late")) {
      issues.push("late_delivery");
    }

    // Update communication with parsed response
    const { error: updateError } = await supabase
      .from("supplier_communications")
      .update({
        response_received_at: new Date().toISOString(),
        response_parsed: true,
        response_summary: response_text.substring(0, 500), // Store first 500 chars
        metadata: {
          ...(comm.metadata || {}),
          parsed: {
            confirmed: isConfirmed,
            eta: eta,
            delivery_date: deliveryDate,
            issues_detected: issues,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", communication_id);

    if (updateError) {
      console.error("Error updating communication:", updateError);
      return NextResponse.json(
        { error: "Failed to update communication" },
        { status: 500 }
      );
    }

    // If confirmed and has ETA, update order status
    if (isConfirmed && comm.material_orders) {
      const order = (comm as any).material_orders;
      
      // Update order status to confirmed if it was just ordered
      if (order.status === "ordered") {
        await supabase
          .from("material_orders")
          .update({
            status: "confirmed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
      }
    }

    // If issues detected, create issue records
    for (const issueType of issues) {
      await supabase.rpc("report_supplier_issue", {
        p_material_order_id: comm.material_order_id,
        p_issue_type: issueType,
        p_description: `Issue detected in supplier response: ${response_text.substring(0, 200)}`,
        p_detected_by: "system",
      });
    }

    return NextResponse.json({
      success: true,
      parsed: {
        confirmed: isConfirmed,
        eta: eta,
        delivery_date: deliveryDate,
        issues_detected: issues,
      },
    });
  } catch (error: any) {
    console.error("Error in parse-response:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































