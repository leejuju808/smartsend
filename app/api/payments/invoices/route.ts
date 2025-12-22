import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { stripe } from "@/src/lib/stripe";

/**
 * POST /api/payments/invoices
 * Create a new invoice with optional Stripe payment link
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      job_id,
      homeowner_name,
      homeowner_email,
      amount_due,
      due_date,
      invoice_type = "full",
      line_items = [],
      notes,
      create_payment_link = false,
    } = body;

    // Validate required fields
    if (!homeowner_name || !homeowner_email || !amount_due) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Calculate total from line items if provided
    let calculatedTotal = amount_due;
    if (line_items && line_items.length > 0) {
      calculatedTotal = line_items.reduce(
        (sum: number, item: any) => sum + (item.total || 0),
        0
      );
    }

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        org_id: orgId,
        job_id: job_id || null,
        homeowner_name,
        homeowner_email,
        amount_due: calculatedTotal,
        due_date: due_date || null,
        invoice_type,
        notes: notes || null,
        status: "pending",
      })
      .select()
      .single();

    if (invoiceError) {
      console.error("Error creating invoice:", invoiceError);
      return NextResponse.json(
        { error: "Failed to create invoice", details: invoiceError.message },
        { status: 500 }
      );
    }

    // Create invoice items if provided
    if (line_items && line_items.length > 0) {
      const itemsToInsert = line_items.map((item: any, index: number) => ({
        invoice_id: invoice.id,
        description: item.description || "",
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total: item.total || 0,
        line_order: index,
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.error("Error creating invoice items:", itemsError);
        // Continue even if items fail - invoice is created
      }
    }

    // Create Stripe payment link if requested
    let paymentLink = null;
    if (create_payment_link && calculatedTotal > 0) {
      try {
        const stripeLink = await stripe.paymentLinks.create({
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Invoice ${invoice.invoice_number}`,
                  description: `Payment for ${homeowner_name}`,
                },
                unit_amount: Math.round(calculatedTotal * 100), // Convert to cents
              },
              quantity: 1,
            },
          ],
          metadata: {
            invoice_id: invoice.id,
            org_id: orgId,
            homeowner_email,
            invoice_type,
          },
        });

        // Store payment link in database
        const { error: linkError } = await supabase
          .from("payment_links")
          .insert({
            invoice_id: invoice.id,
            payment_url: stripeLink.url,
            stripe_payment_link_id: stripeLink.id,
            link_type: invoice_type === "deposit" ? "deposit" : "full_payment",
            amount: calculatedTotal,
            is_active: true,
          });

        if (!linkError) {
          paymentLink = stripeLink.url;
        }
      } catch (stripeError: any) {
        console.error("Error creating Stripe payment link:", stripeError);
        // Continue - invoice is created, just no payment link
      }
    }

    return NextResponse.json({
      invoice,
      payment_link: paymentLink,
    });
  } catch (error: any) {
    console.error("Error in POST /api/payments/invoices:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payments/invoices
 * List invoices for the current organization
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("invoices")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error("Error fetching invoices:", error);
      return NextResponse.json(
        { error: "Failed to fetch invoices" },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoices: invoices || [] });
  } catch (error: any) {
    console.error("Error in GET /api/payments/invoices:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























