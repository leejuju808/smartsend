// Block 228000 — Create Change Order Draft
// POST /api/change-orders/create
// Creates a change order draft with line items

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { job_id, items, reason, description, crew_issue_id } = await req.json();

    if (!job_id || !reason || !description) {
      return NextResponse.json(
        { error: "job_id, reason, and description are required" },
        { status: 400 }
      );
    }

    // Verify job exists and get workspace_id
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      // Try roofing_jobs table
      const { data: roofingJob, error: roofingJobError } = await supabase
        .from("roofing_jobs")
        .select("id, workspace_id")
        .eq("id", job_id)
        .single();

      if (roofingJobError || !roofingJob) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      // Use roofing_jobs data
      const workspace_id = roofingJob.workspace_id;
      
      // Verify user has access to workspace
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!member) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }

      // Calculate total cost from items
      const added_cost = items?.reduce((sum: number, item: any) => {
        return sum + (Number(item.qty || 1) * Number(item.unit_price || 0));
      }, 0) || 0;

      // Generate portal token for homeowner approval
      const portal_token = Buffer.from(`${job_id}-${Date.now()}-${Math.random()}`).toString('base64').replace(/[+/=]/g, '').substring(0, 32);

      // Create change order
      const { data: changeOrder, error: coError } = await supabase
        .from("change_orders")
        .insert({
          job_id,
          workspace_id,
          created_by: user.id,
          reason,
          description,
          added_cost,
          crew_issue_id: crew_issue_id || null,
          portal_token,
          status: "draft",
        })
        .select()
        .single();

      if (coError || !changeOrder) {
        console.error("Error creating change order:", coError);
        return NextResponse.json(
          { error: "Failed to create change order" },
          { status: 500 }
        );
      }

      // Create line items if provided
      if (items && Array.isArray(items) && items.length > 0) {
        const lineItems = items.map((item: any) => ({
          change_order_id: changeOrder.id,
          label: item.label,
          qty: Number(item.qty || 1),
          unit_price: Number(item.unit_price || 0),
        }));

        const { error: itemsError } = await supabase
          .from("change_order_items")
          .insert(lineItems);

        if (itemsError) {
          console.error("Error creating line items:", itemsError);
          // Continue anyway, items can be added later
        }
      }

      // Get full change order with items
      const { data: fullChangeOrder, error: fetchError } = await supabase
        .from("change_orders")
        .select(`
          *,
          change_order_items (*)
        `)
        .eq("id", changeOrder.id)
        .single();

      return NextResponse.json({
        success: true,
        change_order_id: changeOrder.id,
        change_order: fullChangeOrder,
        preview_html: generatePreviewHTML(fullChangeOrder),
      });
    }

    // Use jobs table data
    const workspace_id = job.workspace_id;
    
    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Calculate total cost from items
    const added_cost = items?.reduce((sum: number, item: any) => {
      return sum + (Number(item.qty || 1) * Number(item.unit_price || 0));
    }, 0) || 0;

    // Generate portal token for homeowner approval
    const portal_token = Buffer.from(`${job_id}-${Date.now()}-${Math.random()}`).toString('base64').replace(/[+/=]/g, '').substring(0, 32);

    // Create change order
    const { data: changeOrder, error: coError } = await supabase
      .from("change_orders")
      .insert({
        job_id,
        workspace_id,
        created_by: user.id,
        reason,
        description,
        added_cost,
        crew_issue_id: crew_issue_id || null,
        portal_token,
        status: "draft",
      })
      .select()
      .single();

    if (coError || !changeOrder) {
      console.error("Error creating change order:", coError);
      return NextResponse.json(
        { error: "Failed to create change order" },
        { status: 500 }
      );
    }

    // Create line items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      const lineItems = items.map((item: any) => ({
        change_order_id: changeOrder.id,
        label: item.label,
        qty: Number(item.qty || 1),
        unit_price: Number(item.unit_price || 0),
      }));

      const { error: itemsError } = await supabase
        .from("change_order_items")
        .insert(lineItems);

      if (itemsError) {
        console.error("Error creating line items:", itemsError);
        // Continue anyway, items can be added later
      }
    }

    // Get full change order with items
    const { data: fullChangeOrder, error: fetchError } = await supabase
      .from("change_orders")
      .select(`
        *,
        change_order_items (*)
      `)
      .eq("id", changeOrder.id)
      .single();

    return NextResponse.json({
      success: true,
      change_order_id: changeOrder.id,
      change_order: fullChangeOrder,
      preview_html: generatePreviewHTML(fullChangeOrder),
    });
  } catch (error: any) {
    console.error("Error creating change order:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create change order" },
      { status: 500 }
    );
  }
}

function generatePreviewHTML(changeOrder: any): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">Change Order</h2>
      
      <div style="margin: 20px 0;">
        <p><strong>Reason:</strong> ${changeOrder.reason}</p>
        <p><strong>Description:</strong> ${changeOrder.description}</p>
        <p><strong>Status:</strong> ${changeOrder.status}</p>
        <p><strong>Added Cost:</strong> $${changeOrder.added_cost?.toFixed(2) || '0.00'}</p>
      </div>
      
      ${changeOrder.change_order_items && changeOrder.change_order_items.length > 0 ? `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Item</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Qty</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Unit Price</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${changeOrder.change_order_items.map((item: any) => `
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">${item.label}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.qty}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">$${item.unit_price?.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">$${item.line_total?.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>
  `;
}

























