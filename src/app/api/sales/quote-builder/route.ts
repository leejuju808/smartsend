// Block 254300 — SmartSend Sales Acceleration Engine v1
// Instant Quote Builder API
// POST /api/sales/quote-builder

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

interface QuoteRequest {
  org_id: string;
  lead_id?: string;
  estimate_id?: string;
  job_type: string;
  squares: number;
  shingle_series?: string;
  add_ons?: {
    ridge_vent?: boolean;
    gutters?: boolean;
    deck_repairs?: boolean;
    skylights?: number;
    chimneys?: number;
  };
  financing_options?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: QuoteRequest = await req.json();
    const {
      org_id,
      lead_id,
      estimate_id,
      job_type,
      squares,
      shingle_series = "architectural",
      add_ons = {},
      financing_options = false,
    } = body;

    // Get base estimate if estimate_id provided
    let baseEstimate = null;
    if (estimate_id) {
      const { data } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", estimate_id)
        .single();
      baseEstimate = data;
    }

    // Calculate add-on costs
    const addOnCosts: Record<string, number> = {};
    let addOnTotal = 0;

    if (add_ons.ridge_vent) {
      const ridgeVentCost = squares * 15; // ~$15 per square for ridge vent
      addOnCosts.ridge_vent = ridgeVentCost;
      addOnTotal += ridgeVentCost;
    }

    if (add_ons.gutters) {
      const gutterCost = squares * 25; // ~$25 per square for gutters
      addOnCosts.gutters = gutterCost;
      addOnTotal += gutterCost;
    }

    if (add_ons.deck_repairs) {
      const deckRepairCost = squares * 50; // ~$50 per square for deck repairs
      addOnCosts.deck_repairs = deckRepairCost;
      addOnTotal += deckRepairCost;
    }

    if (add_ons.skylights) {
      const skylightCost = (add_ons.skylights || 0) * 500; // $500 per skylight
      addOnCosts.skylights = skylightCost;
      addOnTotal += skylightCost;
    }

    if (add_ons.chimneys) {
      const chimneyCost = (add_ons.chimneys || 0) * 300; // $300 per chimney
      addOnCosts.chimneys = chimneyCost;
      addOnTotal += chimneyCost;
    }

    // Base price from estimate or calculate
    const basePrice = baseEstimate?.price || squares * 450; // Fallback: $450/sq
    const totalPrice = basePrice + addOnTotal;

    // Generate scope of work
    const scopeOfWork = [
      `Tear off all existing shingles (${squares} squares)`,
      "Install synthetic underlayment",
      "Install drip edge around entire perimeter",
      `Install ${shingle_series.replace(/_/g, " ")} shingles`,
      "Replace pipe boots",
      ...(add_ons.ridge_vent ? ["Install ridge vent system"] : []),
      ...(add_ons.gutters ? ["Install new gutters and downspouts"] : []),
      ...(add_ons.deck_repairs ? ["Replace damaged decking as needed"] : []),
      ...(add_ons.skylights ? [`Install ${add_ons.skylights} skylight(s)`] : []),
      ...(add_ons.chimneys ? [`Flash ${add_ons.chimneys} chimney(s)`] : []),
      "Clean up and dispose of all debris",
      "Final inspection and walkthrough",
    ];

    // Upsell options
    const upsellOptions = [
      {
        name: "Premium Shingles",
        description: "Upgrade to premium architectural shingles",
        price: squares * 50,
      },
      {
        name: "Gutter Guards",
        description: "Install gutter guard system",
        price: squares * 20,
      },
      {
        name: "Solar-Ready",
        description: "Prepare roof for future solar installation",
        price: squares * 30,
      },
    ];

    // Financing options
    const financingOptions = financing_options
      ? [
          {
            term: "12 months",
            apr: "0%",
            monthly_payment: Math.round(totalPrice / 12),
          },
          {
            term: "24 months",
            apr: "4.99%",
            monthly_payment: Math.round((totalPrice * 1.05) / 24),
          },
          {
            term: "36 months",
            apr: "5.99%",
            monthly_payment: Math.round((totalPrice * 1.08) / 36),
          },
        ]
      : [];

    const quote = {
      job_type,
      squares,
      shingle_series,
      base_price: basePrice,
      add_ons: addOnCosts,
      add_ons_total: addOnTotal,
      total_price: totalPrice,
      scope_of_work: scopeOfWork,
      upsell_options: upsellOptions,
      financing_options: financingOptions,
      breakdown: {
        base: basePrice,
        add_ons: addOnTotal,
        total: totalPrice,
      },
    };

    return NextResponse.json({
      success: true,
      quote,
    });
  } catch (error: any) {
    console.error("Error in quote builder:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















