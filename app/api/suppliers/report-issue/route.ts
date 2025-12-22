// Block 24340 — Supplier Communication Engine
// API Route: Report Supplier Issue
// POST /api/suppliers/report-issue

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gmailSendThroughWorkspace } from "@/lib/providers/gmail/send";

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
    const {
      material_order_id,
      issue_type,
      description,
      detected_by = "roofer",
    } = body;

    if (!material_order_id || !issue_type || !description) {
      return NextResponse.json(
        { error: "Missing required fields: material_order_id, issue_type, description" },
        { status: 400 }
      );
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .select(`
        *,
        suppliers (*),
        roofing_jobs (*)
      `)
      .eq("id", material_order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Material order not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", order.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const supplier = (order as any).suppliers;
    const job = (order as any).roofing_jobs;

    // Create issue record using database function
    const { data: issueId, error: issueError } = await supabase.rpc(
      "report_supplier_issue",
      {
        p_material_order_id: material_order_id,
        p_issue_type: issue_type,
        p_description: description,
        p_detected_by: detected_by,
      }
    );

    if (issueError) {
      console.error("Error creating issue:", issueError);
      return NextResponse.json(
        { error: "Failed to create issue record" },
        { status: 500 }
      );
    }

    // Send issue resolution email to supplier
    if (supplier && supplier.email) {
      const subject = `Issue with Delivery — ${job.title || "Roofing Job"}`;
      
      const addressParts = [
        job.address,
        job.city,
        job.state,
        job.zip
      ].filter(Boolean);
      const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "N/A";

      const body = `Hello ${supplier.contact_name || supplier.name},

We received the following issue on today's delivery for ${job.title || "the roofing project"} at ${fullAddress}:

Issue Type: ${issue_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
Description: ${description}

Please advise ETA for correction or supplemental order.

Thank you,
SmartSend Automated System`;

      try {
        // Create communication record
        const { data: commData, error: commError } = await supabase
          .from("supplier_communications")
          .insert({
            workspace_id: order.workspace_id,
            material_order_id: material_order_id,
            supplier_id: order.supplier_id,
            job_id: order.job_id,
            communication_type: "issue_resolution",
            subject,
            body,
            recipient_email: supplier.email,
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (commError) {
          console.error("Error creating communication record:", commError);
        } else {
          // Send email
          await gmailSendThroughWorkspace(order.workspace_id, {
            to: supplier.email,
            subject,
            html: body.replace(/\n/g, "<br>"),
          });

          // Update communication status
          await supabase
            .from("supplier_communications")
            .update({
              status: "delivered",
              updated_at: new Date().toISOString(),
            })
            .eq("id", commData.id);

          // Link communication to issue
          await supabase
            .from("supplier_issues")
            .update({
              communication_id: commData.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", issueId);
        }
      } catch (emailError: any) {
        console.error("Error sending issue email:", emailError);
        // Don't fail the request if email fails
      }
    }

    return NextResponse.json({
      success: true,
      issue_id: issueId,
      message: "Issue reported successfully",
    });
  } catch (error: any) {
    console.error("Error in report-issue:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































