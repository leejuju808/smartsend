import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      quote_id,
      lead_id,
      title,
      notes,
      items // [{label, quantity, unit_price}]
    } = body;

    if (!lead_id && !quote_id) {
      return NextResponse.json(
        { error: "lead_id or quote_id required" },
        { status: 400 }
      );
    }

    let quoteId = quote_id;

    // 1) If no quote_id, create a new quote
    if (!quoteId) {
      // Verify user has access to the lead
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .select("id, workspace_id")
        .eq("id", lead_id)
        .single();

      if (leadErr || !lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      // Check workspace access
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", lead.workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!membership) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      const { data, error } = await supabase
        .from("quotes")
        .insert({
          lead_id,
          title: title || "Roofing Estimate",
          notes: notes || null,
          status: "draft"
        })
        .select("id")
        .single();

      if (error) {
        console.error("Error creating quote:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      quoteId = data.id;
    } else {
      // Verify user has access to the quote
      const { data: existingQuote, error: quoteErr } = await supabase
        .from("quotes")
        .select("lead_id, leads!inner(workspace_id)")
        .eq("id", quoteId)
        .single();

      if (quoteErr || !existingQuote) {
        return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      }

      // Check workspace access
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", existingQuote.leads.workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!membership) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      const { error } = await supabase
        .from("quotes")
        .update({ 
          title: title || undefined, 
          notes: notes !== undefined ? notes : undefined 
        })
        .eq("id", quoteId);

      if (error) {
        console.error("Error updating quote:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // 2) Replace quote items
    if (items && Array.isArray(items)) {
      // Clear existing
      await supabase.from("quote_items").delete().eq("quote_id", quoteId);

      const toInsert = items
        .filter((it: any) => it.label && it.label.trim())
        .map((it: any) => ({
          quote_id: quoteId,
          label: it.label.trim(),
          quantity: it.quantity ?? 1,
          unit_price: it.unit_price ?? 0
        }));

      if (toInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from("quote_items")
          .insert(toInsert);
        
        if (itemsErr) {
          console.error("Error inserting quote items:", itemsErr);
          return NextResponse.json({ error: itemsErr.message }, { status: 500 });
        }
      }
    }

    // 3) Recalc totals
    const { error: recalcErr } = await supabase.rpc("recalc_quote_totals", {
      p_quote_id: quoteId
    });
    
    if (recalcErr) {
      console.error("Error recalculating totals:", recalcErr);
      return NextResponse.json({ error: recalcErr.message }, { status: 500 });
    }

    // Return the updated quote
    const { data: fullQuote, error: fetchErr } = await supabase
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", quoteId)
      .single();

    if (fetchErr) {
      console.error("Error fetching quote:", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    return NextResponse.json(fullQuote);
  } catch (error: any) {
    console.error("Unexpected error in save quote:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}










































