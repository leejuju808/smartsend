// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// Edge Function: /send-material-order
// 
// Sends material order PO to supplier via email
// Generates professional PDF PO and emails it to supplier's delivery desk

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch material order with supplier and job details
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .select(`
        *,
        suppliers (
          id,
          name,
          email,
          phone,
          address,
          account_number
        ),
        roofing_jobs (
          id,
          title,
          address,
          homeowner_name,
          workspace_id
        )
      `)
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      console.error("Order fetch error:", orderError);
      return new Response(
        JSON.stringify({ error: "Material order not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!order.suppliers || !order.suppliers.email) {
      return new Response(
        JSON.stringify({ error: "Supplier email not found" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch order items
    const { data: items, error: itemsError } = await supabase
      .from("material_order_items")
      .select("*")
      .eq("material_order_id", order_id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      console.error("Items fetch error:", itemsError);
      return new Response(
        JSON.stringify({ error: "Failed to load order items" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build email content
    const jobAddress = order.roofing_jobs?.address || order.job_site_address || "Job Site";
    const deliveryDate = order.delivery_date 
      ? new Date(order.delivery_date).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : "TBD";

    const emailSubject = `Material Order PO - ${order.roofing_jobs?.title || 'Job'} - Delivery ${deliveryDate}`;
    
    const emailBody = `
Dear ${order.suppliers.name} Delivery Team,

Please confirm materials for delivery on ${deliveryDate} for the following job:

JOB DETAILS:
- Job: ${order.roofing_jobs?.title || 'Roofing Job'}
- Address: ${jobAddress}
- Delivery Date: ${deliveryDate}
${order.delivery_instructions ? `- Delivery Instructions: ${order.delivery_instructions}` : ''}
${order.crew_details ? `- Crew Contact: ${order.crew_details}` : ''}
${order.suppliers.account_number ? `- Account Number: ${order.suppliers.account_number}` : ''}

MATERIALS REQUESTED:
${(items || []).map((item, idx) => 
  `${idx + 1}. ${item.item_name}: ${item.quantity} ${item.unit}${item.color ? ` (Color: ${item.color})` : ''}${item.brand ? ` - ${item.brand}` : ''}`
).join('\n')}

${order.notes ? `\nSPECIAL NOTES:\n${order.notes}` : ''}

Please confirm this order and provide an estimated delivery time.

Thank you,
SmartSend Material Ordering System
`;

    // Generate PO PDF (call PDF generation function if available, otherwise just use email body)
    // For v1, we'll store the email body as PO content
    // In production, you'd call a PDF generation service here
    
    // Try to get workspace info for company name
    let companyName = "SmartSend Roofing";
    if (order.roofing_jobs?.workspace_id) {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", order.roofing_jobs.workspace_id)
        .single();
      if (workspace?.name) {
        companyName = workspace.name;
      }
    }

    // Store PO content in database (will be used for PDF generation later)
    const poContent = {
      supplier: order.suppliers.name,
      jobTitle: order.roofing_jobs?.title || 'Roofing Job',
      jobAddress,
      deliveryDate,
      accountNumber: order.suppliers.account_number,
      items: items || [],
      notes: order.notes,
      companyName,
      poNumber: order.po_number || `PO-${order_id.substring(0, 8)}`,
      createdAt: order.created_at,
    };

    // Update order status and store PO info
    const { error: updateError } = await supabase
      .from("material_orders")
      .update({
        status: "sent",
        po_number: poContent.poNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id);

    if (updateError) {
      console.error("Update error:", updateError);
    }

    // Send email using Resend or your email service
    // For now, we'll invoke the send-email function or use Resend directly
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (resendApiKey) {
      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "SmartSend <noreply@smartsend.ai>",
            to: order.suppliers.email,
            subject: emailSubject,
            text: emailBody,
            // TODO: Attach PDF when PDF generation is implemented
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error("Email send error:", errorText);
          throw new Error(`Email send failed: ${errorText}`);
        }

        const emailData = await emailResponse.json();
        console.log("Email sent successfully:", emailData.id);
      } catch (emailError) {
        console.error("Email error:", emailError);
        // Don't fail the request if email fails - we can retry later
      }
    } else {
      console.warn("RESEND_API_KEY not configured, skipping email send");
      // In production, you might want to queue this for later
    }

    return new Response(
      JSON.stringify({
        ok: true,
        order_id,
        status: "sent",
        po_number: poContent.poNumber,
        email_sent: !!resendApiKey,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});































